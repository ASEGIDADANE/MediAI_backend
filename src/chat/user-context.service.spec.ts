import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  OnboardingMeasurementSystem,
  OnboardingPreferredFeature,
  OnboardingSexAtBirth,
  OnboardingUserRole,
  type UserProfile,
} from '../generated/prisma/client';
import { UserContextService } from './user-context.service';

function sampleProfile(over: Partial<UserProfile> = {}): UserProfile {
  return {
    userId: 'u1',
    role: OnboardingUserRole.personal,
    preferredName: 'Alex',
    confirmedAdult: true,
    region: 'Addis Ababa',
    ageYears: 40,
    measurementSystem: OnboardingMeasurementSystem.metric,
    weight: '70',
    heightFeet: null,
    heightInches: null,
    heightCm: '175',
    sexAtBirth: OnboardingSexAtBirth.male,
    preferredFeature: OnboardingPreferredFeature.ai_doctor,
    professionalProfile: null,
    medicalHistory: {
      chronicDiseases: ['hypertension'],
      currentMedications: 'none',
    },
    aiDoctorSetupCompleted: false,
    verificationStatus: null,
    verificationSubmittedAt: null,
    verificationReviewedAt: null,
    verificationReviewedBy: null,
    verificationNotes: null,
    medicalSpecialty: null,
    primaryConditions: [],
    onboardingCompletedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

describe('UserContextService', () => {
  it('builds bounded text including key fields', () => {
    const svc = new UserContextService({
      get: (k: string, d?: string) => d ?? '4000',
    } as unknown as ConfigService);
    const t = svc.buildFromUserProfile(sampleProfile());
    expect(t).toContain('Preferred name: Alex');
    expect(t).toContain('chronicDiseases');
    expect(t.length).toBeLessThanOrEqual(4500);
  });

  it('includes family and surgical history when present', () => {
    const svc = new UserContextService({
      get: (k: string, d?: string) => d ?? '4000',
    } as unknown as ConfigService);
    const t = svc.buildFromUserProfile(
      sampleProfile({
        medicalHistory: {
          chronicDiseases: ['hypertension'],
          familyHistory: ['Diabetes'],
          familyHistoryDetails: 'Father diagnosed in his 50s.',
          surgicalHistory: 'Appendectomy 2010.',
          currentMedications: 'amlodipine',
        },
      }),
    );
    expect(t).toContain('familyHistory');
    expect(t).toContain('surgicalHistory');
    expect(t).toContain('Appendectomy');
  });
});
