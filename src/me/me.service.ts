import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import {
  AccountAuditAction,
  OnboardingMeasurementSystem,
  OnboardingSexAtBirth,
  OnboardingUserRole,
  ProfessionalVerificationStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toPrismaPreferredFeature } from '../profile/preferred-feature.util';
import { AccountAuditService } from './account-audit.service';
import type { AuditRequestContext } from './audit-request.util';
import {
  MAX_PROFILE_JSON_CHARS,
  PatchMeProfileDto,
} from './dto/patch-me-profile.dto';
import { MedicalHistoryDataDto } from './dto/medical-history-data.dto';
import { PatchAiDoctorSetupDto } from './dto/ai-doctor-setup.dto';
import {
  parseMedicalHistory,
  userProfileToDashboardProfile,
} from './user-profile.mapper';
import { readBothConsultationFeesMajor } from '../consultations/consultation-profile-fees.util';
import { inferMedicalSpecialty } from '../consultations/consultation-matching.constants';

const MAX_MEDICAL_JSON = 100_000;

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AccountAuditService,
  ) {}

  async getMe(userId: string) {
    const p = await this.prisma.userProfile.findUnique({
      where: { userId },
    });
    if (!p) {
      return {
        profile: null,
        medicalHistory: null,
        aiDoctorSetupCompleted: false,
      };
    }
    return {
      profile: userProfileToDashboardProfile(p),
      medicalHistory: parseMedicalHistory(p.medicalHistory),
      aiDoctorSetupCompleted: p.aiDoctorSetupCompleted,
    };
  }

  async patchProfile(
    userId: string,
    dto: PatchMeProfileDto,
    ctx?: AuditRequestContext,
  ) {
    const existing = await this.prisma.userProfile.findUnique({
      where: { userId },
    });
    if (!existing) {
      throw new NotFoundException(
        'Profile not found. Complete onboarding first.',
      );
    }

    const data: Prisma.UserProfileUpdateInput = {};

    if (dto.professionalProfile !== undefined) {
      const s = JSON.stringify(dto.professionalProfile);
      if (s.length > MAX_PROFILE_JSON_CHARS) {
        throw new BadRequestException('professionalProfile is too large');
      }
      const base =
        existing.professionalProfile &&
        typeof existing.professionalProfile === 'object' &&
        !Array.isArray(existing.professionalProfile)
          ? (existing.professionalProfile as Record<string, unknown>)
          : {};
      const merged = { ...base, ...dto.professionalProfile };
      const ms = JSON.stringify(merged);
      if (ms.length > MAX_PROFILE_JSON_CHARS) {
        throw new BadRequestException(
          'merged professionalProfile is too large',
        );
      }
      data.professionalProfile = merged as Prisma.InputJsonValue;

      // Phase 5 — best-effort auto-mapping. If the doctor is updating the
      // free-text `specialty` and they haven't yet picked a canonical value
      // (and the patch didn't explicitly set one), try to infer it. This
      // gets existing verified doctors onto the matching layer the moment
      // they touch their profile again, without forcing them to pick from
      // the dropdown.
      const inferred =
        existing.medicalSpecialty === null &&
        dto.medicalSpecialty === undefined &&
        typeof (dto.professionalProfile as Record<string, unknown>)
          .specialty === 'string'
          ? inferMedicalSpecialty(
              (dto.professionalProfile as Record<string, unknown>)
                .specialty as string,
            )
          : null;
      if (inferred) {
        data.medicalSpecialty = inferred;
      }
    }

    if (dto.preferredName !== undefined) {
      data.preferredName = dto.preferredName.trim();
    }

    if (dto.age !== undefined) {
      const n = parseInt(dto.age.trim(), 10);
      if (Number.isNaN(n) || n < 1 || n > 130) {
        throw new BadRequestException('age must be a number between 1 and 130');
      }
      data.ageYears = n;
    }

    if (dto.region !== undefined) {
      data.region = dto.region;
    }

    if (dto.measurementSystem !== undefined) {
      data.measurementSystem =
        dto.measurementSystem === 'metric'
          ? OnboardingMeasurementSystem.metric
          : OnboardingMeasurementSystem.imperial;
    }

    if (dto.weight !== undefined) {
      data.weight = dto.weight.trim();
    }

    if (dto.heightFeet !== undefined) {
      data.heightFeet = dto.heightFeet.trim() || null;
    }
    if (dto.heightInches !== undefined) {
      data.heightInches = dto.heightInches.trim() || null;
    }
    if (dto.heightCm !== undefined) {
      data.heightCm = dto.heightCm.trim() || null;
    }

    if (dto.sexAtBirth !== undefined) {
      data.sexAtBirth = toPrismaSex(dto.sexAtBirth);
    }

    if (dto.preferredFeature !== undefined) {
      data.preferredFeature = toPrismaPreferredFeature(dto.preferredFeature);
    }

    // Phase 5 — smart-matching fields. Both are role-gated:
    //   * Only the doctor's `medicalSpecialty` matters for matching, so we
    //     silently ignore patient writes to it.
    //   * `primaryConditions` is patient-only for the same reason.
    // Silent-ignore (instead of 400) keeps onboarding wizards simple: the
    // frontend can always include both keys regardless of role.
    if (
      dto.medicalSpecialty !== undefined &&
      existing.role === OnboardingUserRole.professional
    ) {
      data.medicalSpecialty = dto.medicalSpecialty;
    }
    if (
      dto.primaryConditions !== undefined &&
      existing.role === OnboardingUserRole.personal
    ) {
      data.primaryConditions = { set: dto.primaryConditions };
    }

    const msAfter =
      dto.measurementSystem ??
      (existing.measurementSystem === OnboardingMeasurementSystem.metric
        ? 'metric'
        : 'imperial');
    const willTouchHeights =
      dto.heightFeet !== undefined ||
      dto.heightInches !== undefined ||
      dto.heightCm !== undefined ||
      dto.measurementSystem !== undefined;
    if (willTouchHeights) {
      this.validateHeights(msAfter, {
        heightFeet: dto.heightFeet ?? existing.heightFeet ?? null,
        heightInches: dto.heightInches ?? existing.heightInches ?? null,
        heightCm: dto.heightCm ?? existing.heightCm ?? null,
      });
    }

    if (dto.measurementSystem === 'imperial') {
      data.heightCm = null;
    } else if (dto.measurementSystem === 'metric') {
      data.heightFeet = null;
      data.heightInches = null;
    }

    if (Object.keys(data).length === 0) {
      return this.getMe(userId);
    }

    await this.prisma.userProfile.update({
      where: { userId },
      data,
    });
    const fieldsTouched = (
      Object.keys(dto) as (keyof PatchMeProfileDto)[]
    ).filter((k) => dto[k] !== undefined);
    await this.audit.log(userId, AccountAuditAction.profile_patch, ctx, {
      fields: fieldsTouched,
    });
    return this.getMe(userId);
  }

  async putMedicalHistory(
    userId: string,
    body: MedicalHistoryDataDto,
    ctx?: AuditRequestContext,
  ) {
    const s = JSON.stringify(body);
    if (s.length > MAX_MEDICAL_JSON) {
      throw new BadRequestException('medical history payload is too large');
    }

    const existing = await this.prisma.userProfile.findUnique({
      where: { userId },
    });
    if (!existing) {
      throw new NotFoundException(
        'Profile not found. Complete onboarding first.',
      );
    }

    await this.prisma.userProfile.update({
      where: { userId },
      data: {
        medicalHistory: { ...body } as Prisma.InputJsonValue,
      },
    });
    await this.audit.log(userId, AccountAuditAction.medical_history_put, ctx, {
      section: 'medicalHistory',
    });
    return this.getMe(userId);
  }

  async patchAiDoctorSetup(
    userId: string,
    dto: PatchAiDoctorSetupDto,
    ctx?: AuditRequestContext,
  ) {
    const existing = await this.prisma.userProfile.findUnique({
      where: { userId },
    });
    if (!existing) {
      throw new NotFoundException(
        'Profile not found. Complete onboarding first.',
      );
    }

    await this.prisma.userProfile.update({
      where: { userId },
      data: { aiDoctorSetupCompleted: dto.completed },
    });
    await this.audit.log(
      userId,
      AccountAuditAction.ai_doctor_setup_patch,
      ctx,
      { completed: dto.completed },
    );
    return this.getMe(userId);
  }

  /**
   * Mark a professional's verification packet as ready for admin review.
   *
   * Requirements (all must be present, post-merge):
   *   - `role = professional`
   *   - existing `professionalProfile.specialty` (set during onboarding)
   *   - existing `professionalProfile.licenseNumber`
   *   - existing `professionalProfile.yearsOfExperience` (number ≥ 0)
   *   - existing `professionalProfile.bio` (non-empty)
   *
   * Side-effects:
   *   - sets `verificationStatus = pending` (resets after a rejection re-submit)
   *   - sets `verificationSubmittedAt = now()`
   *   - clears `verificationReviewedAt`, `verificationReviewedBy`,
   *     `verificationNotes` (so an old rejection doesn't leak into the new
   *     review)
   *
   * Returns the updated `getMe` snapshot so the client can hydrate without an
   * extra round-trip.
   */
  async submitVerification(userId: string) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new NotFoundException('Complete onboarding first.');
    }
    if (profile.role !== OnboardingUserRole.professional) {
      throw new BadRequestException(
        'Only professional accounts request verification.',
      );
    }
    if (
      profile.verificationStatus === ProfessionalVerificationStatus.verified
    ) {
      throw new ConflictException('Your account is already verified.');
    }

    const prof =
      profile.professionalProfile &&
      typeof profile.professionalProfile === 'object' &&
      !Array.isArray(profile.professionalProfile)
        ? (profile.professionalProfile as Record<string, unknown>)
        : {};

    const missing: string[] = [];
    const requireString = (key: string) => {
      const v = prof[key];
      if (typeof v !== 'string' || v.trim() === '') missing.push(key);
    };
    const requireNumber = (key: string) => {
      const v = prof[key];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
        missing.push(key);
      }
    };
    requireString('specialty');
    requireString('licenseNumber');
    requireNumber('yearsOfExperience');
    requireString('bio');

    const fees = readBothConsultationFeesMajor(profile.professionalProfile);
    if (fees.video <= 0) {
      missing.push('videoConsultationFee');
    }
    if (fees.written <= 0) {
      missing.push('writtenConsultationFee');
    }

    if (missing.length > 0) {
      throw new BadRequestException({
        message:
          'Your verification packet is missing required fields. Fill them and try again.',
        missing,
      });
    }

    await this.prisma.userProfile.update({
      where: { userId },
      data: {
        verificationStatus: ProfessionalVerificationStatus.pending,
        verificationSubmittedAt: new Date(),
        verificationReviewedAt: null,
        verificationReviewedBy: null,
        verificationNotes: null,
      },
    });

    return this.getMe(userId);
  }

  private validateHeights(
    system: 'imperial' | 'metric',
    h: {
      heightFeet: string | null;
      heightInches: string | null;
      heightCm: string | null;
    },
  ) {
    if (system === 'imperial') {
      if (!h.heightFeet?.trim() || !h.heightInches?.trim()) {
        throw new BadRequestException(
          'heightFeet and heightInches are required for imperial',
        );
      }
    } else {
      if (!h.heightCm?.trim()) {
        throw new BadRequestException('heightCm is required for metric');
      }
    }
  }
}

function toPrismaSex(s: 'male' | 'female' | 'other'): OnboardingSexAtBirth {
  if (s === 'female') {
    return OnboardingSexAtBirth.female;
  }
  if (s === 'male') {
    return OnboardingSexAtBirth.male;
  }
  return OnboardingSexAtBirth.other;
}
