import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import {
  AccountAuditAction,
  OnboardingMeasurementSystem,
  OnboardingSexAtBirth,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toPrismaPreferredFeature } from '../profile/preferred-feature.util';
import { AccountAuditService } from './account-audit.service';
import type { AuditRequestContext } from './audit-request.util';
import { MAX_PROFILE_JSON_CHARS, PatchMeProfileDto } from './dto/patch-me-profile.dto';
import { MedicalHistoryDataDto } from './dto/medical-history-data.dto';
import { PatchAiDoctorSetupDto } from './dto/ai-doctor-setup.dto';
import {
  parseMedicalHistory,
  userProfileToDashboardProfile,
} from './user-profile.mapper';

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
        throw new BadRequestException('merged professionalProfile is too large');
      }
      data.professionalProfile = merged as Prisma.InputJsonValue;
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
        heightFeet: (dto.heightFeet ?? existing.heightFeet) ?? null,
        heightInches: (dto.heightInches ?? existing.heightInches) ?? null,
        heightCm: (dto.heightCm ?? existing.heightCm) ?? null,
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
    await this.audit.log(
      userId,
      AccountAuditAction.profile_patch,
      ctx,
      { fields: fieldsTouched },
    );
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
    await this.audit.log(
      userId,
      AccountAuditAction.medical_history_put,
      ctx,
      { section: 'medicalHistory' },
    );
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

  private validateHeights(
    system: 'imperial' | 'metric',
    h: { heightFeet: string | null; heightInches: string | null; heightCm: string | null },
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
