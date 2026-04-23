import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { UserProfile } from '../generated/prisma/client';
import {
  OnboardingMeasurementSystem,
  OnboardingSexAtBirth,
  OnboardingUserRole,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  fromPrismaPreferredFeature,
  toPrismaPreferredFeature,
} from '../profile/preferred-feature.util';
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
    const preferredFeature = toPrismaPreferredFeature(dto.preferredFeature);

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
      preferredFeature: fromPrismaPreferredFeature(profile.preferredFeature),
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

}
