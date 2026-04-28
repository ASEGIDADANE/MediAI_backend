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
});
