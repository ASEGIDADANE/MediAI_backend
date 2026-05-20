-- Phase 5 — Smart matching taxonomy
--
-- Adds two PostgreSQL enums plus two columns on `UserProfile`:
--   * `medical_specialty` — single canonical specialty for verified doctors,
--     null until set by the doctor's profile or the admin backfill.
--   * `primary_conditions` — array of patient-facing condition categories
--     ("heart_circulation", "skin", ...). Empty array by default so existing
--     onboarded patients keep working with no rewrite.
--
-- The application-side mapping ConditionCategory → MedicalSpecialty[] lives
-- in `src/consultations/consultation-matching.constants.ts`; this migration
-- intentionally does not encode the mapping so the product team can re-tune
-- it without another DB migration.

CREATE TYPE "MedicalSpecialty" AS ENUM (
  'general_practice',
  'internal_medicine',
  'cardiology',
  'dermatology',
  'endocrinology',
  'gastroenterology',
  'gynecology_obstetrics',
  'hematology',
  'infectious_disease',
  'neurology',
  'oncology',
  'ophthalmology',
  'orthopedics',
  'ent_otolaryngology',
  'pediatrics',
  'psychiatry',
  'pulmonology',
  'rheumatology',
  'urology',
  'nephrology',
  'general_surgery',
  'neurosurgery',
  'dentistry',
  'allergology',
  'plastic_surgery',
  'other'
);

CREATE TYPE "ConditionCategory" AS ENUM (
  'general_wellness',
  'heart_circulation',
  'skin',
  'digestive_stomach',
  'diabetes_hormones',
  'mental_health',
  'womens_health',
  'childrens_health',
  'bones_joints',
  'eyes',
  'ear_nose_throat',
  'lungs_breathing',
  'kidney_urinary',
  'allergies',
  'cancer_oncology',
  'neurological',
  'dental',
  'reproductive_health',
  'other'
);

ALTER TABLE "UserProfile"
  ADD COLUMN IF NOT EXISTS "medical_specialty" "MedicalSpecialty",
  ADD COLUMN IF NOT EXISTS "primary_conditions" "ConditionCategory"[] NOT NULL DEFAULT ARRAY[]::"ConditionCategory"[];

-- Phase 5 — composite index for the smart-matching query: fetch verified
-- professionals filtered by canonical specialty in a single B-tree lookup.
CREATE INDEX IF NOT EXISTS "UserProfile_role_verificationStatus_medicalSpecialty_idx"
  ON "UserProfile" ("role", "verification_status", "medical_specialty");
