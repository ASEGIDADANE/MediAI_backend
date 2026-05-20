import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccountAuditAction,
  ConsultationBookingStatus,
  ConsultationRefundStatus,
  ConsultationType,
  NotificationType,
  OnboardingUserRole,
  ProfessionalVerificationStatus,
  UserAppRole,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CancelConsultationBookingDto,
  ConsultationBookingListResponseDto,
  ConsultationBookingResponseDto,
  CreateConsultationBookingDto,
} from './dto/consultations.dto';
import { formatPaymentPrice } from '../payments/payment-format.util';
import { readConsultationFeeMajorFromProfile } from './consultation-profile-fees.util';
import { AvailabilityService } from '../availability/availability.service';
import { AccountAuditService } from '../me/account-audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CANCELLABLE_BY_PATIENT_STATUSES,
  MAX_PENDING_BOOKINGS_PER_PATIENT,
  PATIENT_PENDING_QUOTA_STATUSES,
  REFUNDABLE_STATUSES,
  SLOT_HOLDING_STATUSES,
} from './booking-statuses';

@Injectable()
export class ConsultationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly availability: AvailabilityService,
    private readonly notifications: NotificationsService,
    private readonly audit: AccountAuditService,
  ) {}

  async createBooking(
    userId: string,
    appRole: UserAppRole,
    dto: CreateConsultationBookingDto,
  ): Promise<ConsultationBookingResponseDto> {
    if (appRole !== UserAppRole.user) {
      throw new ForbiddenException(
        'Only signed-in patient accounts can create a consultation booking.',
      );
    }

    const patientProfile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { role: true },
    });
    if (
      !patientProfile ||
      patientProfile.role !== OnboardingUserRole.personal
    ) {
      throw new ForbiddenException(
        'Only personal patient accounts can create consultation bookings.',
      );
    }

    const doctor = await this.prisma.userProfile.findFirst({
      where: {
        userId: dto.topDoctorId,
        role: OnboardingUserRole.professional,
        verificationStatus: ProfessionalVerificationStatus.verified,
      },
      select: {
        userId: true,
        preferredName: true,
        professionalProfile: true,
      },
    });
    if (!doctor) {
      throw new NotFoundException('Doctor not found.');
    }

    const feeMajor = readConsultationFeeMajorFromProfile(
      doctor.professionalProfile,
      dto.consultationType,
    );
    if (feeMajor <= 0) {
      // For Phase 4 types (`in_person`, `hybrid`) we fall back to video /
      // written fees inside the util, so reaching this branch means the
      // doctor hasn't set any fee at all — guide them to the same fix
      // either way.
      const kind = dto.consultationType.replace(/_/g, '-');
      throw new BadRequestException(
        `This doctor has not set a positive ${kind} consultation fee (ETB) on their public profile, so paid checkout is disabled. They can add fees under Dashboard → Doctor verification → Edit profile (?edit=1).`,
      );
    }

    // Phase 3 — spam quota. Patient may only have so many bookings stacked
    // up in `pending_payment` / `paid` / `pending_doctor_approval`. Once a
    // booking moves to `approved` / `completed` / `cancelled` / `rejected`
    // it no longer counts toward the cap.
    const pendingCount = await this.prisma.consultationBooking.count({
      where: {
        patientUserId: userId,
        status: { in: PATIENT_PENDING_QUOTA_STATUSES },
      },
    });
    if (pendingCount >= MAX_PENDING_BOOKINGS_PER_PATIENT) {
      throw new ConflictException(
        `You already have ${MAX_PENDING_BOOKINGS_PER_PATIENT} consultation requests pending. Wait for a doctor to respond (or cancel one) before booking another.`,
      );
    }

    // Phase 3 — slot validation. When the patient picks a slot, verify it's
    // (a) actually in the doctor's bookable feed and (b) not already held by
    // someone else. We do both in one shot by asking the availability service
    // for the current slot list and checking membership. Field name on the
    // wire is `startsAt` to match the slot DTO; we persist it as
    // `scheduledFor` in the DB (the column predates the slot DTO; keeping
    // the column avoids a cosmetic destructive migration).
    let scheduledFor: Date | null = null;
    let durationMinutes = 30;
    if (dto.startsAt) {
      const parsed = new Date(dto.startsAt);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException('Invalid `startsAt` timestamp.');
      }
      if (parsed.getTime() <= Date.now()) {
        throw new BadRequestException('Scheduled time must be in the future.');
      }
      const slotInfo = await this.matchSlot(dto.topDoctorId, parsed);
      scheduledFor = slotInfo.startsAt;
      durationMinutes = slotInfo.durationMinutes;
    }

    const currency =
      this.config.get<string>('CHAPA_CURRENCY')?.toUpperCase() ?? 'ETB';
    const consultationFeeCents = Math.round(feeMajor * 100);
    const booking = await this.prisma.consultationBooking.create({
      data: {
        patientUserId: userId,
        topDoctorId: dto.topDoctorId,
        consultationType: dto.consultationType,
        status: ConsultationBookingStatus.pending_payment,
        consultationFeeCents,
        currency,
        patientNotes: dto.patientNotes?.trim() || null,
        scheduledFor,
        durationMinutes,
      },
      include: {
        topDoctor: {
          select: {
            email: true,
            profile: {
              select: {
                preferredName: true,
                professionalProfile: true,
              },
            },
          },
        },
      },
    });

    // Phase 6 — patient-side audit + in-app confirmation that the request
    // was captured (pre-payment). The doctor isn't notified yet — that
    // happens after payment finalizes (`payments.service`), gated by the
    // "no-spam-before-payment" rule introduced in Phase 3.
    void this.afterBookingCreated(booking, dto.topDoctorId).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn(
        `[consultations] booking-created notification failed (id=${booking.id}):`,
        err,
      );
    });
    return toConsultationBookingDto(booking);
  }

  private async afterBookingCreated(
    booking: { id: string; patientUserId: string; scheduledFor: Date | null },
    doctorUserId: string,
  ): Promise<void> {
    await this.audit.log(
      booking.patientUserId,
      AccountAuditAction.consultation_booking_created,
      undefined,
      {
        bookingId: booking.id,
        doctorUserId,
      },
    );
    await this.notifications.enqueue({
      userId: booking.patientUserId,
      type: NotificationType.booking_submitted,
      title: 'Consultation request started',
      body: booking.scheduledFor
        ? `We're holding your slot at ${booking.scheduledFor.toISOString()}. Finish payment to send the request to the doctor.`
        : "Finish payment to send your consultation request to the doctor.",
      actionUrl: '/dashboard/consultations',
      metadata: { bookingId: booking.id, doctorUserId },
      // No email at the "submitted-but-unpaid" step — too noisy for the
      // common case where the user is mid-checkout.
      channels: ['inApp'],
    });
  }

  /**
   * Patient-side cancel. Lets a patient walk away from a booking at any
   * point before the consultation completes; the action sets `cancelled_at`,
   * stamps `cancelled_by_user_id`, and — when the booking had already been
   * paid — moves `refund_status` to `pending` so the finance pipeline knows
   * to issue a refund.
   */
  async cancelMyBooking(
    callerUserId: string,
    bookingId: string,
    dto: CancelConsultationBookingDto,
  ): Promise<ConsultationBookingResponseDto> {
    const booking = await this.prisma.consultationBooking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        patientUserId: true,
        status: true,
      },
    });
    if (!booking || booking.patientUserId !== callerUserId) {
      // 404 instead of 403 — same ID-enumeration mitigation as Phase 1.
      throw new NotFoundException('Consultation booking not found.');
    }
    if (!CANCELLABLE_BY_PATIENT_STATUSES.includes(booking.status)) {
      throw new ConflictException(
        `This booking is already in a terminal state (${booking.status}) and can't be cancelled.`,
      );
    }
    const wasRefundable = REFUNDABLE_STATUSES.includes(booking.status);
    const trimmedReason = dto.reason?.trim() || null;
    const updated = await this.prisma.consultationBooking.update({
      where: { id: bookingId },
      data: {
        status: ConsultationBookingStatus.cancelled,
        cancelledAt: new Date(),
        cancelledByUserId: callerUserId,
        cancelReason: trimmedReason,
        refundStatus: wasRefundable
          ? ConsultationRefundStatus.pending
          : ConsultationRefundStatus.none,
      },
      include: {
        topDoctor: {
          select: {
            id: true,
            email: true,
            profile: {
              select: {
                preferredName: true,
                professionalProfile: true,
              },
            },
          },
        },
        patient: {
          select: {
            profile: { select: { preferredName: true } },
          },
        },
      },
    });
    void this.afterPatientCancelled(updated, trimmedReason).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn(
        `[consultations] patient-cancel notification failed (id=${updated.id}):`,
        err,
      );
    });
    return toConsultationBookingDto(updated);
  }

  private async afterPatientCancelled(
    updated: {
      id: string;
      patientUserId: string;
      topDoctorId: string;
      topDoctor?: { profile: { preferredName: string | null } | null } | null;
      patient?: { profile: { preferredName: string | null } | null } | null;
    },
    reason: string | null,
  ): Promise<void> {
    // The patient is the *acting* user — log against them.
    await this.audit.log(
      updated.patientUserId,
      AccountAuditAction.appointment_cancelled,
      undefined,
      {
        bookingId: updated.id,
        doctorUserId: updated.topDoctorId,
        cancelledBy: 'patient',
        reasonByteLength: reason?.length ?? 0,
      },
    );

    // Notify the doctor — they're the one whose schedule just freed up.
    const patientName =
      updated.patient?.profile?.preferredName?.trim() || 'The patient';
    await this.notifications.enqueue({
      userId: updated.topDoctorId,
      type: NotificationType.booking_cancelled,
      title: 'A patient cancelled their consultation',
      body: reason
        ? `${patientName} cancelled their consultation: "${reason.slice(0, 160)}".`
        : `${patientName} cancelled their consultation.`,
      actionUrl: '/dashboard/appointments',
      metadata: { bookingId: updated.id, cancelledBy: 'patient' },
      channels: ['inApp', 'email'],
    });
  }

  /**
   * Confirms a chosen `scheduledFor` actually corresponds to a real slot in
   * the doctor's availability feed. Pulls a one-day window around the
   * requested timestamp so we don't compute 14 days of slots just to validate
   * a single one. Race-condition tight enough for V1 — two patients racing
   * for the exact same slot will both pass this check; we fix that the
   * cheap way via a doctor-side `(top_doctor_id, scheduled_for)` overlap
   * check on the very next line.
   */
  private async matchSlot(
    doctorUserId: string,
    when: Date,
  ): Promise<{ startsAt: Date; durationMinutes: number }> {
    const windowStart = new Date(when.getTime() - 6 * 60 * 60 * 1000);
    const { items } = await this.availability.computeSlots(
      doctorUserId,
      windowStart.toISOString(),
      2,
    );
    const target = when.toISOString();
    const slot = items.find((s) => s.startsAt === target);
    if (!slot) {
      throw new ConflictException(
        'The selected time slot is not available. Pick another from the doctor’s availability.',
      );
    }
    // Phase 3 race-mitigation: re-check the DB right before insert for a
    // booking that already holds this exact slot.
    const clash = await this.prisma.consultationBooking.findFirst({
      where: {
        topDoctorId: doctorUserId,
        scheduledFor: when,
        status: { in: SLOT_HOLDING_STATUSES },
      },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException(
        'Another patient just grabbed this slot. Please pick another.',
      );
    }
    const durationMinutes = Math.max(
      5,
      Math.round(
        (new Date(slot.endsAt).getTime() - new Date(slot.startsAt).getTime()) /
          60000,
      ),
    );
    return { startsAt: new Date(slot.startsAt), durationMinutes };
  }

  async listMyBookings(
    userId: string,
  ): Promise<ConsultationBookingListResponseDto> {
    const rows = await this.prisma.consultationBooking.findMany({
      where: { patientUserId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        topDoctor: {
          select: {
            email: true,
            profile: {
              select: {
                preferredName: true,
                professionalProfile: true,
              },
            },
          },
        },
      },
    });
    return { items: rows.map(toConsultationBookingDto) };
  }

  async getBookingById(
    userId: string,
    appRole: UserAppRole,
    bookingId: string,
  ): Promise<ConsultationBookingResponseDto> {
    const row = await this.prisma.consultationBooking.findUnique({
      where: { id: bookingId },
      include: {
        topDoctor: {
          select: {
            email: true,
            profile: {
              select: {
                preferredName: true,
                professionalProfile: true,
              },
            },
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException('Consultation booking not found.');
    }
    if (appRole !== UserAppRole.admin && row.patientUserId !== userId) {
      throw new ForbiddenException('This consultation booking is not yours.');
    }
    return toConsultationBookingDto(row);
  }
}

function toConsultationBookingDto(row: {
  id: string;
  topDoctorId: string;
  consultationType: ConsultationType;
  status: ConsultationBookingStatus;
  consultationFeeCents: number;
  currency: string;
  patientNotes: string | null;
  paidAt: Date | null;
  chapaTxRef: string | null;
  scheduledFor: Date | null;
  durationMinutes: number;
  doctorDecisionReason: string | null;
  cancelReason: string | null;
  cancelledByUserId: string | null;
  refundStatus: ConsultationRefundStatus;
  meetingLink: string | null;
  meetingLinkSetAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  topDoctor: {
    email: string;
    profile: {
      preferredName: string;
      professionalProfile: unknown;
    } | null;
  };
}): ConsultationBookingResponseDto {
  // Phase 4 chat-gating partner: even though the column always exists on
  // the row, we only surface the meeting link to the patient once the
  // doctor has approved (or further). Hides "Dr. Foo posted a meeting
  // link" leaks during the still-pending decision window.
  const meetingLinkVisible =
    row.status === ConsultationBookingStatus.approved ||
    row.status === ConsultationBookingStatus.completed ||
    row.status === ConsultationBookingStatus.missed ||
    row.status === ConsultationBookingStatus.confirmed;
  return {
    id: row.id,
    topDoctorId: row.topDoctorId,
    topDoctorName: resolveDoctorName(row.topDoctor),
    consultationType: row.consultationType,
    status: row.status,
    consultationFeeCents: row.consultationFeeCents,
    consultationFeeDisplay: formatPaymentPrice(
      row.consultationFeeCents,
      row.currency,
    ),
    currency: row.currency,
    patientNotes: row.patientNotes,
    paidAt: row.paidAt?.toISOString() ?? null,
    chapaTxRef: row.chapaTxRef,
    startsAt: row.scheduledFor?.toISOString() ?? null,
    endsAt: computeEndsAt(row.scheduledFor, row.durationMinutes),
    durationMinutes: row.durationMinutes,
    doctorDecisionReason: row.doctorDecisionReason,
    cancelReason: row.cancelReason,
    cancelledByUserId: row.cancelledByUserId,
    refundStatus: row.refundStatus,
    meetingLink: meetingLinkVisible ? row.meetingLink : null,
    meetingLinkSetAt:
      meetingLinkVisible && row.meetingLinkSetAt
        ? row.meetingLinkSetAt.toISOString()
        : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function computeEndsAt(
  scheduledFor: Date | null,
  durationMinutes: number,
): string | null {
  if (!scheduledFor) return null;
  return new Date(
    scheduledFor.getTime() + durationMinutes * 60_000,
  ).toISOString();
}

function resolveDoctorName(doctor: {
  email: string;
  profile: {
    preferredName: string;
    professionalProfile: unknown;
  } | null;
}): string {
  const fullName = readString(doctor.profile?.professionalProfile, 'fullName');
  return fullName ?? doctor.profile?.preferredName ?? doctor.email;
}

function readString(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const next = (value as Record<string, unknown>)[key];
  return typeof next === 'string' && next.trim() !== '' ? next.trim() : null;
}
