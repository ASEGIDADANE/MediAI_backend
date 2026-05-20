import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OnboardingUserRole,
  Prisma,
  type UserProfile,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ACTIVE_DOCTOR_PATIENT_RELATIONSHIP_STATUSES,
  bookingChatWindowEndsAt,
  CHAT_ALLOWED_STATUSES,
  isBookingChatActive,
} from '../consultations/booking-statuses';
import {
  takeSkipFromListPatients,
  type ListPatientsQueryDto,
} from './dto/list-patients-query.dto';
import {
  ListPatientsResponseDto,
  PatientSummaryDto,
} from './dto/patient-summary.dto';
import { PatientDetailDto } from './dto/patient-detail.dto';
import {
  PatientMessageDto,
  PatientMessageThreadDto,
} from './dto/patient-message-response.dto';
import {
  parseMedicalHistory,
  userProfileToDashboardProfile,
} from '../me/user-profile.mapper';
import { MeService } from '../me/me.service';
import type { AuditRequestContext } from '../me/audit-request.util';
import type { PatchMeProfileDto } from '../me/dto/patch-me-profile.dto';
import type { MedicalHistoryDataDto } from '../me/dto/medical-history-data.dto';

const PATIENT_INCLUDE = {
  email: true,
  createdAt: true,
  profile: true,
} as const;

/**
 * Single source of truth for "what counts as a current doctor↔patient
 * relationship" lives in `consultations/booking-statuses.ts`. Re-exported
 * locally so existing call sites don't have to be touched.
 */
const ACTIVE_BOOKING_STATUSES = ACTIVE_DOCTOR_PATIENT_RELATIONSHIP_STATUSES;

/**
 * Prisma `User` where-clause that restricts the result to patients with at
 * least one `ConsultationBooking` in `ACTIVE_BOOKING_STATUSES` against the
 * given doctor. Used to AND into the `listPatients` query *and* (via
 * {@link ProfessionalService.requireRelatedPatient}) to gate every
 * per-patient endpoint, so a doctor can never read or mutate data for a
 * patient they have no working relationship with.
 */
function activeBookingFilterFor(doctorUserId: string): Prisma.UserWhereInput {
  return {
    consultationBookings: {
      some: {
        topDoctorId: doctorUserId,
        status: { in: ACTIVE_BOOKING_STATUSES },
      },
    },
  };
}

@Injectable()
export class ProfessionalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly meService: MeService,
  ) {}

  /**
   * Throws 403 unless the caller's `UserProfile.role === 'professional'`.
   * Personal users (or users without a profile) cannot reach `/professional/*`.
   */
  async assertCallerIsProfessional(callerUserId: string): Promise<void> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId: callerUserId },
      select: { role: true },
    });
    if (!profile || profile.role !== OnboardingUserRole.professional) {
      throw new ForbiddenException(
        'Only professional users can access this endpoint.',
      );
    }
  }

  async listPatients(
    callerUserId: string,
    dto: ListPatientsQueryDto,
  ): Promise<ListPatientsResponseDto> {
    await this.assertCallerIsProfessional(callerUserId);

    const { take, skip, page, pageSize } = takeSkipFromListPatients(
      dto.page,
      dto.pageSize,
    );
    const q = dto.q?.trim();

    // The doctor only sees personal users (a) who are not themselves and
    // (b) who have an active ConsultationBooking with the doctor. The latter
    // is the privacy gate: before this rule shipped a verified doctor could
    // see every patient in the system, which violates the relationship-based
    // access model described in the product spec.
    const baseWhere: Prisma.UserWhereInput = {
      AND: [
        { id: { not: callerUserId } },
        { profile: { is: { role: OnboardingUserRole.personal } } },
        activeBookingFilterFor(callerUserId),
      ],
    };
    const where: Prisma.UserWhereInput =
      q && q.length > 0
        ? {
            AND: [
              baseWhere,
              {
                OR: [
                  {
                    email: {
                      contains: q,
                      mode: 'insensitive' as const,
                    },
                  },
                  {
                    profile: {
                      is: {
                        preferredName: {
                          contains: q,
                          mode: 'insensitive' as const,
                        },
                      },
                    },
                  },
                ],
              },
            ],
          }
        : baseWhere;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        select: {
          id: true,
          ...PATIENT_INCLUDE,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const ids = rows.map((r) => r.id);
    const threads =
      ids.length === 0
        ? []
        : await this.prisma.doctorPatientThread.findMany({
            where: {
              doctorUserId: callerUserId,
              patientUserId: { in: ids },
            },
            select: { patientUserId: true, updatedAt: true },
          });
    const lastActivityByPatient = new Map<string, Date>();
    for (const t of threads) {
      lastActivityByPatient.set(t.patientUserId, t.updatedAt);
    }

    const items: PatientSummaryDto[] = rows.map((r) =>
      this.toSummary(r, lastActivityByPatient.get(r.id) ?? null),
    );

    return { items, page, pageSize, total };
  }

  async getPatient(
    callerUserId: string,
    patientId: string,
  ): Promise<PatientDetailDto> {
    await this.assertCallerIsProfessional(callerUserId);

    // Single query that also enforces the relationship gate. A doctor probing
    // for an arbitrary patient ID gets the same 404 they would for a missing
    // record — we never leak "this patient exists, you just can't see them".
    const user = await this.prisma.user.findFirst({
      where: {
        AND: [
          { id: patientId },
          { id: { not: callerUserId } },
          { profile: { is: { role: OnboardingUserRole.personal } } },
          activeBookingFilterFor(callerUserId),
        ],
      },
      select: {
        id: true,
        ...PATIENT_INCLUDE,
      },
    });
    if (!user || !user.profile) {
      throw new NotFoundException('Patient not found.');
    }

    return {
      id: user.id,
      email: user.email,
      profile: userProfileToDashboardProfile(user.profile),
      medicalHistory: parseMedicalHistory(user.profile.medicalHistory),
      registeredAt: user.createdAt.toISOString(),
      lastUpdatedAt: user.profile.updatedAt.toISOString(),
    };
  }

  /**
   * Doctor-side patch of a patient's `UserProfile`. We strip
   * `professionalProfile` and `preferredFeature` because those are identity
   * preferences owned by the patient themselves — a doctor should never be
   * able to flip them. Everything else (name, age, region, vitals, sex)
   * delegates to the same validators `MeService.patchProfile` already uses
   * for `PATCH /me/profile`, so the rules stay in one place.
   */
  async patchPatientProfile(
    callerUserId: string,
    patientId: string,
    dto: PatchMeProfileDto,
    ctx?: AuditRequestContext,
  ): Promise<PatientDetailDto> {
    await this.assertCallerIsProfessional(callerUserId);
    await this.requirePatient(callerUserId, patientId);

    const safeDto: PatchMeProfileDto = { ...dto };
    delete safeDto.professionalProfile;
    delete safeDto.preferredFeature;

    await this.meService.patchProfile(patientId, safeDto, ctx);
    return this.getPatient(callerUserId, patientId);
  }

  /**
   * Doctor-side full replace of a patient's `medicalHistory` JSON. Reuses the
   * same DTO (`MedicalHistoryDataDto`) the patient uses for
   * `PUT /me/medical-history`, so payload validation is identical.
   */
  async putPatientMedicalHistory(
    callerUserId: string,
    patientId: string,
    body: MedicalHistoryDataDto,
    ctx?: AuditRequestContext,
  ): Promise<PatientDetailDto> {
    await this.assertCallerIsProfessional(callerUserId);
    await this.requirePatient(callerUserId, patientId);

    await this.meService.putMedicalHistory(patientId, body, ctx);
    return this.getPatient(callerUserId, patientId);
  }

  async listMessages(
    callerUserId: string,
    patientId: string,
    limit: number,
  ): Promise<PatientMessageThreadDto> {
    await this.assertCallerIsProfessional(callerUserId);
    const patient = await this.requirePatient(callerUserId, patientId);
    const thread = await this.findOrCreateThread(callerUserId, patientId);

    // Mark unread inbound (patient → doctor) messages as read on fetch.
    await this.prisma.doctorPatientMessage.updateMany({
      where: {
        threadId: thread.id,
        readAt: null,
        senderUserId: patientId,
      },
      data: { readAt: new Date() },
    });

    const rows = await this.prisma.doctorPatientMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const messages: PatientMessageDto[] = rows
      .reverse()
      .map((m) => this.toMessageDto(m, callerUserId));

    const chatWindowEndsAt = await this.resolveChatWindowEndsAt(
      callerUserId,
      patientId,
    );

    return {
      threadId: thread.id,
      patientId,
      patientName: patient.profile?.preferredName ?? '',
      messages,
      chatWindowEndsAt,
    };
  }

  async sendMessage(
    callerUserId: string,
    patientId: string,
    body: string,
  ): Promise<PatientMessageDto> {
    await this.assertCallerIsProfessional(callerUserId);
    await this.requirePatient(callerUserId, patientId);

    const trimmed = body.trim();
    if (trimmed.length === 0) {
      // 400 — `BadRequestException` is the right code for empty bodies; the
      // pre-Phase-4 implementation used `NotFoundException` by mistake.
      throw new BadRequestException('Message body cannot be empty.');
    }

    // Phase 4 — chat-window gate. Doctor can only send while at least one
    // booking with this patient is inside its consultation window
    // (approved/completed/legacy-confirmed AND time-bounded). Outside the
    // window the doctor must wait for the patient to book a follow-up.
    await this.assertChatWindowOpen(callerUserId, patientId);

    const thread = await this.findOrCreateThread(callerUserId, patientId);

    const [, msg] = await this.prisma.$transaction([
      this.prisma.doctorPatientThread.update({
        where: { id: thread.id },
        data: { updatedAt: new Date() },
      }),
      this.prisma.doctorPatientMessage.create({
        data: {
          threadId: thread.id,
          senderUserId: callerUserId,
          body: trimmed,
        },
      }),
    ]);

    return this.toMessageDto(msg, callerUserId);
  }

  /**
   * Mirror of `MessagesService.assertChatWindowOpen` — see the comment
   * there for the rationale. Kept private to this service so each side
   * owns its own pre-flight check.
   */
  private async assertChatWindowOpen(
    doctorUserId: string,
    patientUserId: string,
  ): Promise<void> {
    const candidates = await this.prisma.consultationBooking.findMany({
      where: {
        patientUserId,
        topDoctorId: doctorUserId,
        status: { in: CHAT_ALLOWED_STATUSES },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 5,
      select: {
        id: true,
        status: true,
        scheduledFor: true,
        durationMinutes: true,
        completedAt: true,
        createdAt: true,
      },
    });
    const now = new Date();
    if (candidates.some((b) => isBookingChatActive(b, now))) return;
    if (candidates.length > 0) {
      throw new ForbiddenException(
        'This consultation has ended. The patient must book a follow-up before you can keep messaging.',
      );
    }
    throw new ForbiddenException(
      'Chat is locked — you have no active consultation with this patient.',
    );
  }

  /**
   * Returns the ISO timestamp at which chat will next close for this
   * doctor↔patient pair, or `null` when no booking is currently active.
   * Used by `listMessages` to feed the doctor's chat composer lock UI.
   */
  async resolveChatWindowEndsAt(
    doctorUserId: string,
    patientUserId: string,
  ): Promise<string | null> {
    const candidates = await this.prisma.consultationBooking.findMany({
      where: {
        patientUserId,
        topDoctorId: doctorUserId,
        status: { in: CHAT_ALLOWED_STATUSES },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 5,
      select: {
        id: true,
        status: true,
        scheduledFor: true,
        durationMinutes: true,
        completedAt: true,
        createdAt: true,
      },
    });
    const now = new Date();
    let latest: Date | null = null;
    for (const b of candidates) {
      if (!isBookingChatActive(b, now)) continue;
      const endsAt = bookingChatWindowEndsAt(b);
      if (endsAt && (!latest || endsAt.getTime() > latest.getTime())) {
        latest = endsAt;
      }
    }
    return latest?.toISOString() ?? null;
  }

  // --- helpers ---

  /**
   * Loads a patient *only if* the calling doctor has an active booking with
   * them. Used by every per-patient endpoint that mutates state (profile
   * patch, medical-history put, messaging). The 404 is intentional even when
   * the patient exists but is unrelated — exposing existence would let an
   * attacker enumerate the user table.
   */
  private async requirePatient(callerUserId: string, patientId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        AND: [
          { id: patientId },
          { id: { not: callerUserId } },
          { profile: { is: { role: OnboardingUserRole.personal } } },
          activeBookingFilterFor(callerUserId),
        ],
      },
      select: {
        id: true,
        email: true,
        profile: { select: { role: true, preferredName: true } },
      },
    });
    if (!user || !user.profile) {
      throw new NotFoundException('Patient not found.');
    }
    return user;
  }

  private async findOrCreateThread(
    doctorUserId: string,
    patientUserId: string,
  ) {
    const existing = await this.prisma.doctorPatientThread.findUnique({
      where: {
        doctorUserId_patientUserId: {
          doctorUserId,
          patientUserId,
        },
      },
    });
    if (existing) return existing;
    return this.prisma.doctorPatientThread.create({
      data: { doctorUserId, patientUserId },
    });
  }

  private toMessageDto(
    m: {
      id: string;
      threadId: string;
      senderUserId: string;
      body: string;
      createdAt: Date;
    },
    callerUserId: string,
  ): PatientMessageDto {
    return {
      id: m.id,
      threadId: m.threadId,
      sender: m.senderUserId === callerUserId ? 'doctor' : 'patient',
      senderUserId: m.senderUserId,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    };
  }

  private toSummary(
    row: {
      id: string;
      email: string;
      createdAt: Date;
      profile: UserProfile | null;
    },
    lastActivityAt: Date | null,
  ): PatientSummaryDto {
    const profile = row.profile;
    return {
      id: row.id,
      preferredName: profile?.preferredName ?? '',
      email: row.email,
      age: profile ? String(profile.ageYears) : '',
      sexAtBirth: (profile?.sexAtBirth ?? 'other') as
        | 'male'
        | 'female'
        | 'other',
      region: profile?.region,
      hasMedicalHistory:
        !!profile && parseMedicalHistory(profile.medicalHistory) !== null,
      registeredAt: row.createdAt.toISOString(),
      lastActivityAt: lastActivityAt ? lastActivityAt.toISOString() : null,
    };
  }
}
