import {
  OnboardingMeasurementSystem,
  OnboardingPreferredFeature,
  OnboardingSexAtBirth,
  OnboardingUserRole,
  type UserProfile,
} from '../generated/prisma/client';
import { userProfileToDashboardProfile } from './user-profile.mapper';

function baseUserProfile(over: Partial<UserProfile> = {}): UserProfile {
  return {
    userId: 'u1',
    role: OnboardingUserRole.personal,
    preferredName: 'Alex',
    confirmedAdult: true,
    region: 'Addis Ababa',
    ageYears: 40,
    measurementSystem: OnboardingMeasurementSystem.imperial,
    weight: '180',
    heightFeet: '5',
    heightInches: '10',
    heightCm: null,
    sexAtBirth: OnboardingSexAtBirth.male,
    preferredFeature: OnboardingPreferredFeature.ai_doctor,
    professionalProfile: null,
    medicalHistory: null,
    aiDoctorSetupCompleted: false,
    verificationStatus: null,
    verificationSubmittedAt: null,
    verificationReviewedAt: null,
    verificationReviewedBy: null,
    verificationNotes: null,
    onboardingCompletedAt: new Date('2020-01-01'),
    createdAt: new Date('2020-01-01'),
    updatedAt: new Date('2020-01-01'),
    ...over,
  };
}

describe('userProfileToDashboardProfile', () => {
  it('serializes age as string', () => {
    const p = userProfileToDashboardProfile(baseUserProfile({ ageYears: 48 }));
    expect(p.age).toBe('48');
  });

  it('maps lab_interpretation to lab-test-interpretation for the frontend', () => {
    const p = userProfileToDashboardProfile(
      baseUserProfile({
        preferredFeature: OnboardingPreferredFeature.lab_interpretation,
      }),
    );
    expect(p.preferredFeature).toBe('lab-test-interpretation');
  });

  it('omits professionalProfile when null in DB', () => {
    const p = userProfileToDashboardProfile(baseUserProfile());
    expect(p.professionalProfile).toBeUndefined();
  });

  it('includes professionalProfile when JSON object is present', () => {
    const p = userProfileToDashboardProfile(
      baseUserProfile({ professionalProfile: { title: 'MD', fullName: 'A' } }),
    );
    expect(p.professionalProfile).toEqual({ title: 'MD', fullName: 'A' });
  });
});

describe('userProfileToDashboardProfile metric heights', () => {
  it('uses empty strings for missing height parts', () => {
    const p = userProfileToDashboardProfile(
      baseUserProfile({
        measurementSystem: OnboardingMeasurementSystem.metric,
        heightFeet: null,
        heightInches: null,
        heightCm: '170',
      }),
    );
    expect(p.measurementSystem).toBe('metric');
    expect(p.heightFeet).toBe('');
    expect(p.heightInches).toBe('');
    expect(p.heightCm).toBe('170');
  });
});
