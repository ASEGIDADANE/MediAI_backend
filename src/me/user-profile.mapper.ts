import {
  OnboardingMeasurementSystem,
  type UserProfile,
} from '../generated/prisma/client';
import { fromPrismaPreferredFeature, type PreferredFeatureString } from '../profile/preferred-feature.util';

/**
 * JSON shape stored in `UserProfile.professionalProfile` (MediAI `ProfessionalProfile`).
 */
export type ProfessionalProfileJson = Record<string, unknown>;

/**
 * JSON shape stored in `UserProfile.medicalHistory` (MediAI `MedicalHistoryData`).
 */
export type MedicalHistoryJson = Record<string, unknown>;

export type DashboardProfileResponse = {
  preferredName: string;
  age: string;
  region: string;
  measurementSystem: 'imperial' | 'metric';
  weight: string;
  heightFeet: string;
  heightInches: string;
  heightCm: string;
  sexAtBirth: 'male' | 'female' | 'other';
  preferredFeature: PreferredFeatureString;
  professionalProfile?: ProfessionalProfileJson;
};

export function userProfileToDashboardProfile(
  p: UserProfile,
): DashboardProfileResponse {
  const prof = p.professionalProfile;
  const hasProf = prof !== null && prof !== undefined && typeof prof === 'object';

  return {
    preferredName: p.preferredName,
    age: String(p.ageYears),
    region: p.region,
    measurementSystem:
      p.measurementSystem === OnboardingMeasurementSystem.imperial
        ? 'imperial'
        : 'metric',
    weight: p.weight,
    heightFeet: p.heightFeet ?? '',
    heightInches: p.heightInches ?? '',
    heightCm: p.heightCm ?? '',
    // DB always has a value; expose null only if you later make column optional
    sexAtBirth: p.sexAtBirth as 'male' | 'female' | 'other',
    preferredFeature: fromPrismaPreferredFeature(p.preferredFeature),
    professionalProfile: hasProf ? (prof as ProfessionalProfileJson) : undefined,
  };
}

export function parseMedicalHistory(
  raw: UserProfile['medicalHistory'],
): MedicalHistoryJson | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  return raw as MedicalHistoryJson;
}
