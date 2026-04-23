import { BadRequestException } from '@nestjs/common';
import { OnboardingPreferredFeature } from '../generated/prisma/client';

export type PreferredFeatureString =
  | 'ai-doctor'
  | 'lab-test-interpretation'
  | 'top-doctors';

export function toPrismaPreferredFeature(id: string): OnboardingPreferredFeature {
  switch (id) {
    case 'ai-doctor':
      return OnboardingPreferredFeature.ai_doctor;
    case 'lab-test-interpretation':
    case 'lab-interpretation':
      return OnboardingPreferredFeature.lab_interpretation;
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
    case OnboardingPreferredFeature.lab_interpretation:
      return 'lab-test-interpretation';
    case OnboardingPreferredFeature.top_doctors:
      return 'top-doctors';
    default:
      return 'ai-doctor';
  }
}
