import {
  OnboardingMeasurementSystem,
  ProfessionalVerificationStatus,
  type UserProfile,
} from '../generated/prisma/client';
import {
  fromPrismaPreferredFeature,
  type PreferredFeatureString,
} from '../profile/preferred-feature.util';

/**
 * JSON shape stored in `UserProfile.professionalProfile` (MediAI `ProfessionalProfile`).
 */
export type ProfessionalProfileJson = Record<string, unknown>;

/**
 * JSON shape stored in `UserProfile.medicalHistory` (MediAI `MedicalHistoryData`).
 */
export type MedicalHistoryJson = Record<string, unknown>;

export type DoctorVerificationStatusString =
  | 'pending'
  | 'verified'
  | 'rejected';

export type DoctorVerificationSnapshot = {
  status: DoctorVerificationStatusString;
  /** Null while doctor is still drafting; non-null = "awaiting admin review". */
  submittedAt: string | null;
  reviewedAt: string | null;
  /** Admin notes (mainly rejection reason). */
  notes: string | null;
};

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
  /** Only set for `role=professional` users. */
  verification?: DoctorVerificationSnapshot;
};

function fromPrismaVerificationStatus(
  s: ProfessionalVerificationStatus,
): DoctorVerificationStatusString {
  switch (s) {
    case ProfessionalVerificationStatus.verified:
      return 'verified';
    case ProfessionalVerificationStatus.rejected:
      return 'rejected';
    case ProfessionalVerificationStatus.pending:
    default:
      return 'pending';
  }
}

export function userProfileToDashboardProfile(
  p: UserProfile,
): DashboardProfileResponse {
  const prof = p.professionalProfile;
  const hasProf =
    prof !== null && prof !== undefined && typeof prof === 'object';

  // Verification block is only meaningful for professionals. We use the
  // verification_status column as the single source of truth — it's populated
  // for every professional row (default `pending` on create, `verified` for
  // pre-feature professionals via the migration backfill).
  const verification: DoctorVerificationSnapshot | undefined =
    p.verificationStatus !== null
      ? {
          status: fromPrismaVerificationStatus(p.verificationStatus),
          submittedAt: p.verificationSubmittedAt
            ? p.verificationSubmittedAt.toISOString()
            : null,
          reviewedAt: p.verificationReviewedAt
            ? p.verificationReviewedAt.toISOString()
            : null,
          notes: p.verificationNotes ?? null,
        }
      : undefined;

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
    professionalProfile: hasProf
      ? (prof as ProfessionalProfileJson)
      : undefined,
    verification,
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
