import { BadRequestException } from '@nestjs/common';
import { OnboardingPreferredFeature } from '../generated/prisma/client';

export type PreferredFeatureString =
  | 'ai-doctor'
  | 'top-doctors'
  | 'lab-test-interpretation';

export function toPrismaPreferredFeature(
  id: string,
): OnboardingPreferredFeature {
  switch (id) {
    case 'ai-doctor':
      return OnboardingPreferredFeature.ai_doctor;
    case 'top-doctors':
      return OnboardingPreferredFeature.top_doctors;
    case 'lab-test-interpretation':
      return OnboardingPreferredFeature.lab_interpretation;
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
    case OnboardingPreferredFeature.lab_interpretation:
      return 'lab-test-interpretation';
    default:
      return 'ai-doctor';
  }
}
