import {
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

    // Caller is excluded so a doctor can never message themselves.
    const baseWhere: Prisma.UserWhereInput = {
      id: { not: callerUserId },
      profile: { is: { role: OnboardingUserRole.personal } },
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

    const user = await this.prisma.user.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        ...PATIENT_INCLUDE,
      },
    });
    if (
      !user ||
      !user.profile ||
      user.profile.role !== OnboardingUserRole.personal ||
      user.id === callerUserId
    ) {
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

    return {
      threadId: thread.id,
      patientId,
      patientName: patient.profile?.preferredName ?? '',
      messages,
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
      throw new NotFoundException('Message body cannot be empty.');
    }

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

  // --- helpers ---

  private async requirePatient(callerUserId: string, patientId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: patientId },
      select: {
        id: true,
        email: true,
        profile: { select: { role: true, preferredName: true } },
      },
    });
    if (
      !user ||
      !user.profile ||
      user.profile.role !== OnboardingUserRole.personal ||
      user.id === callerUserId
    ) {
      throw new NotFoundException('Patient not found.');
    }
    return user;
  }

  private async findOrCreateThread(doctorUserId: string, patientUserId: string) {
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
