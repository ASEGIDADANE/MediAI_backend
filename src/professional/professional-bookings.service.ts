import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountAuditAction,
  ConsultationBookingStatus,
  ConsultationRefundStatus,
  ConsultationType,
  NotificationType,
  OnboardingUserRole,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatPaymentPrice } from '../payments/payment-format.util';
import {
  CANCELLABLE_BY_DOCTOR_STATUSES,
  DOCTOR_PENDING_DECISION_STATUSES,
  DOCTOR_SCHEDULED_STATUSES,
  REFUNDABLE_STATUSES,
} from '../consultations/booking-statuses';
import { AccountAuditService } from '../me/account-audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ProfessionalBookingDto,
  ProfessionalBookingListDto,
} from './dto/professional-booking.dto';

/**
 * Doctor-side appointment / booking-request operations:
 *
 *   * Lists for the two dashboard pages.
 *   * State-machine transitions: approve, reject, cancel (post-approval),
 *     mark-completed, mark-missed.
 *
 * All transitions go through `transitionStatus()` which enforces:
 *   1. The caller is the booking's doctor.
 *   2. The current status is in the allowed-source set.
 *   3. The transition stamps the right `*_at` audit column.
 *
 * Refund bookkeeping is intentionally a *flag* (`refund_status`), not an
 * automated Chapa call — the finance pipeline will pick up
 * `refund_status='pending'` rows out-of-band.
 */
@Injectable()
export class ProfessionalBookingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly audit: AccountAuditService,
  ) {}

  // ------------------------------------------------------------------
  // Lists
  // ------------------------------------------------------------------

  /**
   * `pending_doctor_approval` requests waiting on the doctor. Sorted by
   * `scheduledFor` ascending so the doctor sees the most-urgent slot first.
   */
  async listBookingRequests(
    callerUserId: string,
  ): Promise<ProfessionalBookingListDto> {
    await this.assertCallerIsProfessional(callerUserId);
    const rows = await this.prisma.consultationBooking.findMany({
      where: {
        topDoctorId: callerUserId,
        status: { in: DOCTOR_PENDING_DECISION_STATUSES },
      },
      orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
      include: PATIENT_INCLUDE,
    });
    return { items: rows.map(toProfessionalBookingDto) };
  }

  /**
   * "Calendar" view: every appointment with a decision already attached
   * (`approved` / `completed` / `missed` / legacy `confirmed`). Sorted by
   * `scheduledFor` descending — most recent first — to match the
   * `/professional/appointments` page convention.
   */
  async listAppointments(
    callerUserId: string,
  ): Promise<ProfessionalBookingListDto> {
    await this.assertCallerIsProfessional(callerUserId);
    const rows = await this.prisma.consultationBooking.findMany({
      where: {
        topDoctorId: callerUserId,
        status: { in: DOCTOR_SCHEDULED_STATUSES },
      },
      orderBy: [{ scheduledFor: 'desc' }, { createdAt: 'desc' }],
      include: PATIENT_INCLUDE,
    });
    return { items: rows.map(toProfessionalBookingDto) };
  }

  // ------------------------------------------------------------------
  // Transitions
  // ------------------------------------------------------------------

  async approve(
    callerUserId: string,
    bookingId: string,
    options: { meetingLink?: string } = {},
  ): Promise<ProfessionalBookingDto> {
    const stamps: Prisma.ConsultationBookingUpdateInput = {
      approvedAt: new Date(),
    };
    // Phase 4 — doctor can optionally attach a meeting link in the same
    // request that approves the booking. We only persist it when non-empty
    // so we don't silently clear an existing link (the dedicated PATCH
    // endpoint handles that case).
    const link = options.meetingLink?.trim();
    if (link) {
      stamps.meetingLink = link;
      stamps.meetingLinkSetAt = new Date();
    }
    const result = await this.transitionStatus(callerUserId, bookingId, {
      allowedFrom: DOCTOR_PENDING_DECISION_STATUSES,
      to: ConsultationBookingStatus.approved,
      stamps,
      label: 'approve',
    });
    // Phase 6 — patient learns immediately + audit trail.
    void this.notifyAfterTransition(callerUserId, result, {
      auditAction: AccountAuditAction.appointment_approved,
      notification: {
        type: NotificationType.booking_approved,
        title: 'Your consultation request was approved',
        bodyForPatient: (doctorName) =>
          `${doctorName} accepted your consultation request. ${
            link
              ? 'A meeting link is now available on your consultation page.'
              : 'Open MediAI to view the details.'
          }`,
        actionUrl: '/dashboard/consultations',
        sendEmail: true,
      },
    });
    return result;
  }

  /**
   * Set or clear the meeting link on an already-approved booking.
   *
   * Allowed only when the booking is in a status where a meeting link is
   * meaningful (approved / completed / legacy confirmed). Patients see the
   * updated link the next time they refresh their consultation detail.
   * Passing an empty string clears the link.
   */
  async setMeetingLink(
    callerUserId: string,
    bookingId: string,
    rawLink: string,
  ): Promise<ProfessionalBookingDto> {
    const trimmed = rawLink.trim();
    if (trimmed && !/^https?:\/\//i.test(trimmed)) {
      throw new BadRequestException(
        'meetingLink must be a valid http(s) URL.',
      );
    }
    await this.assertCallerIsProfessional(callerUserId);
    const booking = await this.prisma.consultationBooking.findUnique({
      where: { id: bookingId },
      select: { id: true, topDoctorId: true, status: true },
    });
    if (!booking || booking.topDoctorId !== callerUserId) {
      throw new NotFoundException('Consultation booking not found.');
    }
    const ALLOWED: ConsultationBookingStatus[] = [
      ConsultationBookingStatus.approved,
      ConsultationBookingStatus.completed,
      // Legacy: pre-Phase-3 bookings landed on `confirmed`.
      ConsultationBookingStatus.confirmed,
    ];
    if (!ALLOWED.includes(booking.status)) {
      throw new ConflictException(
        `Cannot set a meeting link on a booking in status '${booking.status}'. Approve it first.`,
      );
    }
    const updated = await this.prisma.consultationBooking.update({
      where: { id: bookingId },
      data: trimmed
        ? { meetingLink: trimmed, meetingLinkSetAt: new Date() }
        : { meetingLink: null, meetingLinkSetAt: new Date() },
      include: PATIENT_INCLUDE,
    });
    const dto = toProfessionalBookingDto(updated);
    // Phase 6 — only notify when a link was actually attached; clearing
    // an existing link is an admin-style action that doesn't need a ping.
    void this.notifyAfterTransition(callerUserId, dto, {
      auditAction: AccountAuditAction.meeting_link_set,
      notification: trimmed
        ? {
            type: NotificationType.meeting_link_set,
            title: 'Your meeting link is ready',
            bodyForPatient: (doctorName) =>
              `${doctorName} attached a meeting link to your consultation. Open MediAI to join.`,
            actionUrl: '/dashboard/consultations',
            sendEmail: true,
          }
        : null,
      auditMetadata: { cleared: !trimmed },
    });
    return dto;
  }

  async reject(
    callerUserId: string,
    bookingId: string,
    reason: string,
  ): Promise<ProfessionalBookingDto> {
    const trimmed = reason?.trim();
    if (!trimmed) {
      throw new BadRequestException(
        'A reason is required to reject a booking.',
      );
    }
    const result = await this.transitionStatus(callerUserId, bookingId, {
      allowedFrom: DOCTOR_PENDING_DECISION_STATUSES,
      to: ConsultationBookingStatus.rejected,
      stamps: {
        rejectedAt: new Date(),
        doctorDecisionReason: trimmed,
      },
      refundOnTransition: true,
      label: 'reject',
    });
    void this.notifyAfterTransition(callerUserId, result, {
      auditAction: AccountAuditAction.appointment_rejected,
      notification: {
        type: NotificationType.booking_rejected,
        title: 'Your consultation request was declined',
        bodyForPatient: (doctorName) =>
          `${doctorName} declined your request: "${truncateReason(trimmed)}". Any payment you made will be refunded.`,
        actionUrl: '/dashboard/consultations',
        sendEmail: true,
      },
      auditMetadata: { reasonByteLength: trimmed.length },
    });
    return result;
  }

  async cancel(
    callerUserId: string,
    bookingId: string,
    reason: string | undefined,
  ): Promise<ProfessionalBookingDto> {
    const trimmed = reason?.trim();
    const result = await this.transitionStatus(callerUserId, bookingId, {
      allowedFrom: CANCELLABLE_BY_DOCTOR_STATUSES,
      to: ConsultationBookingStatus.cancelled,
      stamps: {
        cancelledAt: new Date(),
        cancelledByUserId: callerUserId,
        cancelReason: trimmed || null,
      },
      refundOnTransition: true,
      label: 'cancel',
    });
    void this.notifyAfterTransition(callerUserId, result, {
      auditAction: AccountAuditAction.appointment_cancelled,
      notification: {
        type: NotificationType.booking_cancelled,
        title: 'Your consultation was cancelled',
        bodyForPatient: (doctorName) =>
          trimmed
            ? `${doctorName} cancelled the consultation: "${truncateReason(trimmed)}". Any payment will be refunded.`
            : `${doctorName} cancelled the consultation. Any payment will be refunded.`,
        actionUrl: '/dashboard/consultations',
        sendEmail: true,
      },
      auditMetadata: { reasonByteLength: trimmed?.length ?? 0 },
    });
    return result;
  }

  async markCompleted(
    callerUserId: string,
    bookingId: string,
  ): Promise<ProfessionalBookingDto> {
    const result = await this.transitionStatus(callerUserId, bookingId, {
      allowedFrom: [
        ConsultationBookingStatus.approved,
        // Legacy
        ConsultationBookingStatus.confirmed,
      ],
      to: ConsultationBookingStatus.completed,
      stamps: { completedAt: new Date() },
      label: 'mark-completed',
    });
    void this.notifyAfterTransition(callerUserId, result, {
      auditAction: AccountAuditAction.appointment_completed,
      notification: {
        type: NotificationType.booking_completed,
        title: 'Your consultation is marked complete',
        bodyForPatient: (doctorName) =>
          `${doctorName} marked the consultation as complete. You can reply in chat for the next 24 hours.`,
        actionUrl: '/dashboard/consultations',
        sendEmail: false,
      },
    });
    return result;
  }

  async markMissed(
    callerUserId: string,
    bookingId: string,
  ): Promise<ProfessionalBookingDto> {
    return this.transitionStatus(callerUserId, bookingId, {
      allowedFrom: [
        ConsultationBookingStatus.approved,
        // Legacy
        ConsultationBookingStatus.confirmed,
      ],
      to: ConsultationBookingStatus.missed,
      stamps: { missedAt: new Date() },
      // A no-show still owes a refund in many jurisdictions, but the
      // policy isn't decided yet — leave refund untouched for now.
      label: 'mark-missed',
    });
  }

  // ------------------------------------------------------------------
  // Internal
  // ------------------------------------------------------------------

  private async transitionStatus(
    callerUserId: string,
    bookingId: string,
    args: {
      allowedFrom: ConsultationBookingStatus[];
      to: ConsultationBookingStatus;
      stamps: Prisma.ConsultationBookingUpdateInput;
      refundOnTransition?: boolean;
      label: string;
    },
  ): Promise<ProfessionalBookingDto> {
    await this.assertCallerIsProfessional(callerUserId);
    const booking = await this.prisma.consultationBooking.findUnique({
      where: { id: bookingId },
      select: { id: true, topDoctorId: true, status: true },
    });
    if (!booking || booking.topDoctorId !== callerUserId) {
      // 404 to avoid leaking which booking ids belong to other doctors.
      throw new NotFoundException('Consultation booking not found.');
    }
    if (!args.allowedFrom.includes(booking.status)) {
      throw new ConflictException(
        `Cannot ${args.label} a booking in status '${booking.status}'.`,
      );
    }

    const data: Prisma.ConsultationBookingUpdateInput = {
      ...args.stamps,
      status: args.to,
    };
    if (
      args.refundOnTransition &&
      REFUNDABLE_STATUSES.includes(booking.status)
    ) {
      data.refundStatus = ConsultationRefundStatus.pending;
    }

    const updated = await this.prisma.consultationBooking.update({
      where: { id: bookingId },
      data,
      include: PATIENT_INCLUDE,
    });
    return toProfessionalBookingDto(updated);
  }

  private async assertCallerIsProfessional(
    callerUserId: string,
  ): Promise<void> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId: callerUserId },
      select: { role: true },
    });
    if (!profile || profile.role !== OnboardingUserRole.professional) {
      throw new ForbiddenException(
        'Only professional users can manage bookings.',
      );
    }
  }

  /**
   * Phase 6 — fan-out helper called after a successful state transition.
   *
   * Writes:
   *   1. An `AccountAuditLog` row attributed to the *acting* doctor.
   *   2. (optionally) an in-app notification + email to the *patient*.
   *
   * Best-effort: any failure inside this method is logged and swallowed,
   * so a flaky email / notification write never rolls back the underlying
   * status transition the caller already committed.
   */
  private async notifyAfterTransition(
    doctorUserId: string,
    booking: ProfessionalBookingDto,
    args: {
      auditAction: AccountAuditAction;
      auditMetadata?: Record<string, unknown>;
      notification: {
        type: NotificationType;
        title: string;
        bodyForPatient: (doctorPreferredName: string) => string;
        actionUrl?: string;
        sendEmail?: boolean;
      } | null;
    },
  ): Promise<void> {
    try {
      // Lookup the doctor's preferred name in one shot so the patient
      // copy reads like a human (rather than "Doctor accepted…").
      const doctorProfile = await this.prisma.userProfile.findUnique({
        where: { userId: doctorUserId },
        select: { preferredName: true },
      });
      const doctorName =
        doctorProfile?.preferredName?.trim() || 'Your doctor';

      // Audit — the acting user is the doctor; the booking + patient go
      // into the metadata blob (no PHI other than ids).
      await this.audit.log(doctorUserId, args.auditAction, undefined, {
        bookingId: booking.id,
        patientUserId: booking.patientUserId,
        ...(args.auditMetadata ?? {}),
      });

      if (!args.notification) return;
      await this.notifications.enqueue({
        userId: booking.patientUserId,
        type: args.notification.type,
        title: args.notification.title,
        body: args.notification.bodyForPatient(doctorName),
        actionUrl: args.notification.actionUrl ?? null,
        metadata: {
          bookingId: booking.id,
          doctorUserId,
          doctorName,
        },
        channels: args.notification.sendEmail ? ['inApp', 'email'] : ['inApp'],
      });
    } catch (err) {
      // Swallow — see jsdoc.
      // eslint-disable-next-line no-console
      console.warn(
        `[professional-bookings] notifyAfterTransition failed for booking=${booking.id} action=${args.auditAction}:`,
        err,
      );
    }
  }
}

/** Phase 6 — keep rejection / cancellation reason previews terse in copy. */
function truncateReason(reason: string, max = 160): string {
  const trimmed = reason.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

const PATIENT_INCLUDE = {
  patient: {
    select: {
      id: true,
      email: true,
      profile: { select: { preferredName: true } },
    },
  },
} as const;

type ProfessionalBookingRow = {
  id: string;
  consultationType: ConsultationType;
  status: ConsultationBookingStatus;
  consultationFeeCents: number;
  currency: string;
  patientNotes: string | null;
  scheduledFor: Date | null;
  durationMinutes: number;
  paidAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  completedAt: Date | null;
  missedAt: Date | null;
  cancelledAt: Date | null;
  doctorDecisionReason: string | null;
  cancelReason: string | null;
  cancelledByUserId: string | null;
  refundStatus: ConsultationRefundStatus;
  meetingLink: string | null;
  meetingLinkSetAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  patient: {
    id: string;
    email: string;
    profile: { preferredName: string } | null;
  };
};

function toProfessionalBookingDto(
  row: ProfessionalBookingRow,
): ProfessionalBookingDto {
  return {
    id: row.id,
    patientUserId: row.patient.id,
    patientName: row.patient.profile?.preferredName ?? row.patient.email,
    consultationType: row.consultationType,
    status: row.status,
    startsAt: row.scheduledFor?.toISOString() ?? null,
    endsAt: row.scheduledFor
      ? new Date(
          row.scheduledFor.getTime() + row.durationMinutes * 60_000,
        ).toISOString()
      : null,
    durationMinutes: row.durationMinutes,
    consultationFeeCents: row.consultationFeeCents,
    consultationFeeDisplay: formatPaymentPrice(
      row.consultationFeeCents,
      row.currency,
    ),
    currency: row.currency,
    patientNotes: row.patientNotes,
    paidAt: row.paidAt?.toISOString() ?? null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    rejectedAt: row.rejectedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    missedAt: row.missedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    doctorDecisionReason: row.doctorDecisionReason,
    cancelReason: row.cancelReason,
    cancelledByUserId: row.cancelledByUserId,
    refundStatus: row.refundStatus,
    meetingLink: row.meetingLink,
    meetingLinkSetAt: row.meetingLinkSetAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
