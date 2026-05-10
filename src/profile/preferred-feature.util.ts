import { BadRequestException } from '@nestjs/common';
import { OnboardingPreferredFeature } from '../generated/prisma/client';

export type PreferredFeatureString = 'ai-doctor' | 'top-doctors';

export function toPrismaPreferredFeature(
  id: string,
): OnboardingPreferredFeature {
  switch (id) {
    case 'ai-doctor':
      return OnboardingPreferredFeature.ai_doctor;
    case 'top-doctors':
      return OnboardingPreferredFeature.top_doctors;
    default:
      throw new BadRequestException('Invalid preferredFeature');
  }
}

export function fromPrismaPreferredFeature(
  v: OnboardingPreferredFeature,
): PreferredFeatureString {
  switch (v) {
    case OnboardingPreferredFeature.ai_doctor:
      return 'ai-doctor';
    case OnboardingPreferredFeature.top_doctors:
      return 'top-doctors';
    // Legacy DB records: the lab-test feature was removed; coerce to the
    // closest remaining option so existing users have a valid preference.
    case OnboardingPreferredFeature.lab_interpretation:
      return 'ai-doctor';
    default:
      return 'ai-doctor';
  }
}
