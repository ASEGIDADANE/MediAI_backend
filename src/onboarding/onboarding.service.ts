import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { UserProfile } from '../generated/prisma/client';
import {
  OnboardingMeasurementSystem,
  OnboardingPreferredFeature,
  OnboardingSexAtBirth,
  OnboardingUserRole,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { getOnboardingConfigSnapshot } from './onboarding.constants';

export type OnboardingConfigPayload = ReturnType<typeof getOnboardingConfigSnapshot>;

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  getConfig(): OnboardingConfigPayload {
    return getOnboardingConfigSnapshot();
  }

  async getStatus(userId: string) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      return { completed: false, profile: null };
    }

    return {
      completed: true,
      profile: this.toApiProfile(profile),
    };
  }

  async complete(userId: string, dto: CompleteOnboardingDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const role = this.toPrismaRole(dto.role);
    const measurementSystem = this.toPrismaMeasurement(dto.measurementSystem);
    const sexAtBirth = this.toPrismaSex(dto.sexAtBirth);
    const preferredFeature = this.toPrismaFeature(dto.preferredFeature);

    const heightFeet =
      dto.measurementSystem === 'imperial' ? dto.heightFeet! : null;
    const heightInches =
      dto.measurementSystem === 'imperial' ? dto.heightInches! : null;
    const heightCm = dto.measurementSystem === 'metric' ? dto.heightCm! : null;

    const data = {
      preferredName: dto.preferredName.trim(),
      confirmedAdult: dto.confirmedAdult,
      region: dto.region,
      ageYears: dto.age,
      measurementSystem,
      weight: dto.weight.trim(),
      heightFeet,
      heightInches,
      heightCm,
      sexAtBirth,
      preferredFeature,
      onboardingCompletedAt: new Date(),
    };

    const existing = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    if (existing) {
      if (existing.role !== role) {
        throw new ForbiddenException(
          'Your account role cannot be changed after it was set.',
        );
      }

      const updated = await this.prisma.userProfile.update({
        where: { userId },
        data: {
          ...data,
        },
      });

      return {
        completed: true,
        profile: this.toApiProfile(updated),
      };
    }

    const created = await this.prisma.userProfile.create({
      data: {
        userId,
        role,
        ...data,
      },
    });

    return {
      completed: true,
      profile: this.toApiProfile(created),
    };
  }

  private toApiProfile(profile: UserProfile) {
    return {
      role: profile.role,
      preferredName: profile.preferredName,
      confirmedAdult: profile.confirmedAdult,
      region: profile.region,
      age: String(profile.ageYears),
      measurementSystem: profile.measurementSystem,
      weight: profile.weight,
      heightFeet: profile.heightFeet ?? '',
      heightInches: profile.heightInches ?? '',
      heightCm: profile.heightCm ?? '',
      sexAtBirth: profile.sexAtBirth,
      preferredFeature: this.fromPrismaFeature(profile.preferredFeature),
      onboardingCompletedAt: profile.onboardingCompletedAt.toISOString(),
    };
  }

  private toPrismaRole(
    r: CompleteOnboardingDto['role'],
  ): OnboardingUserRole {
    return r === 'professional'
      ? OnboardingUserRole.professional
      : OnboardingUserRole.personal;
  }

  private toPrismaMeasurement(
    m: CompleteOnboardingDto['measurementSystem'],
  ): OnboardingMeasurementSystem {
    return m === 'metric'
      ? OnboardingMeasurementSystem.metric
      : OnboardingMeasurementSystem.imperial;
  }

  private toPrismaSex(
    s: CompleteOnboardingDto['sexAtBirth'],
  ): OnboardingSexAtBirth {
    if (s === 'female') return OnboardingSexAtBirth.female;
    if (s === 'male') return OnboardingSexAtBirth.male;
    return OnboardingSexAtBirth.other;
  }

  private toPrismaFeature(id: string): OnboardingPreferredFeature {
    switch (id) {
      case 'ai-doctor':
        return OnboardingPreferredFeature.ai_doctor;
      case 'lab-interpretation':
        return OnboardingPreferredFeature.lab_interpretation;
      case 'top-doctors':
        return OnboardingPreferredFeature.top_doctors;
      default:
        throw new BadRequestException('Invalid preferredFeature');
    }
  }

  private fromPrismaFeature(
    v: OnboardingPreferredFeature,
  ): 'ai-doctor' | 'lab-interpretation' | 'top-doctors' {
    switch (v) {
      case OnboardingPreferredFeature.ai_doctor:
        return 'ai-doctor';
      case OnboardingPreferredFeature.lab_interpretation:
        return 'lab-interpretation';
      case OnboardingPreferredFeature.top_doctors:
        return 'top-doctors';
      default:
        return 'ai-doctor';
    }
  }
}
