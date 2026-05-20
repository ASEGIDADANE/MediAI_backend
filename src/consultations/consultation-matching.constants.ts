/**
 * Phase 5 — Smart matching constants.
 *
 * Lives in `consultations/` because it's consumed by the booking + listing
 * layers; the file has zero runtime deps so it can be imported anywhere.
 *
 * Two responsibilities:
 *   1. Map each patient-facing `ConditionCategory` to one or more canonical
 *      `MedicalSpecialty` codes used by the doctor's profile.
 *   2. Provide a small helper (`specialtiesForConditions`) that expands a
 *      patient's `primaryConditions` array into a flat de-duplicated list of
 *      specialties for the SQL `IN (...)` filter.
 *
 * Why a constant table and not a DB-driven mapping: this matrix is small
 * (<20 categories), it doubles as product documentation, and changing it
 * never requires a migration — just a PR. If we ever need per-region or
 * per-language tweaks, the mapping can move into a configuration model
 * without changing the call-sites (they go through `specialtiesForConditions`).
 */

import {
  ConditionCategory,
  MedicalSpecialty,
} from '../generated/prisma/client';

/**
 * Each entry lists the specialties that are clinically reasonable for a
 * patient self-selecting the given condition category. Order matters: the
 * first entry is the "primary" specialty, used by the UI when we need a
 * single label (e.g. "Suggested for you: Cardiology").
 *
 * `general_practice` / `internal_medicine` are added as fallbacks on
 * categories that don't have a dedicated specialty — every patient should
 * still get *some* matches.
 */
export const CONDITION_TO_SPECIALTIES: Record<
  ConditionCategory,
  readonly MedicalSpecialty[]
> = {
  general_wellness: [
    MedicalSpecialty.general_practice,
    MedicalSpecialty.internal_medicine,
  ],
  heart_circulation: [
    MedicalSpecialty.cardiology,
    MedicalSpecialty.internal_medicine,
  ],
  skin: [MedicalSpecialty.dermatology],
  digestive_stomach: [
    MedicalSpecialty.gastroenterology,
    MedicalSpecialty.internal_medicine,
  ],
  diabetes_hormones: [
    MedicalSpecialty.endocrinology,
    MedicalSpecialty.internal_medicine,
  ],
  mental_health: [MedicalSpecialty.psychiatry],
  womens_health: [MedicalSpecialty.gynecology_obstetrics],
  childrens_health: [MedicalSpecialty.pediatrics],
  bones_joints: [
    MedicalSpecialty.orthopedics,
    MedicalSpecialty.rheumatology,
  ],
  eyes: [MedicalSpecialty.ophthalmology],
  ear_nose_throat: [MedicalSpecialty.ent_otolaryngology],
  lungs_breathing: [
    MedicalSpecialty.pulmonology,
    MedicalSpecialty.internal_medicine,
  ],
  kidney_urinary: [
    MedicalSpecialty.nephrology,
    MedicalSpecialty.urology,
  ],
  allergies: [
    MedicalSpecialty.allergology,
    MedicalSpecialty.internal_medicine,
  ],
  cancer_oncology: [
    MedicalSpecialty.oncology,
    MedicalSpecialty.internal_medicine,
  ],
  neurological: [
    MedicalSpecialty.neurology,
    MedicalSpecialty.neurosurgery,
  ],
  dental: [MedicalSpecialty.dentistry],
  reproductive_health: [
    MedicalSpecialty.gynecology_obstetrics,
    MedicalSpecialty.urology,
  ],
  other: [
    MedicalSpecialty.general_practice,
    MedicalSpecialty.internal_medicine,
  ],
};

/**
 * Reverse lookup used by tests and admin tooling: given a specialty, which
 * patient-facing categories surface this doctor? Computed lazily once.
 */
let SPECIALTY_TO_CONDITIONS_CACHE:
  | Record<MedicalSpecialty, ConditionCategory[]>
  | null = null;

export function specialtyToConditions(
  specialty: MedicalSpecialty,
): ConditionCategory[] {
  if (!SPECIALTY_TO_CONDITIONS_CACHE) {
    const out = {} as Record<MedicalSpecialty, ConditionCategory[]>;
    for (const cat of Object.keys(CONDITION_TO_SPECIALTIES) as ConditionCategory[]) {
      for (const sp of CONDITION_TO_SPECIALTIES[cat]) {
        if (!out[sp]) out[sp] = [];
        out[sp].push(cat);
      }
    }
    SPECIALTY_TO_CONDITIONS_CACHE = out;
  }
  return SPECIALTY_TO_CONDITIONS_CACHE[specialty] ?? [];
}

/**
 * Expand a patient's condition selections into the flat de-duplicated set of
 * specialties to query for. Used by `/top-doctors` to build the SQL
 * `medicalSpecialty IN (...)` filter.
 *
 * Returns `null` when the input is empty/absent — the caller should treat
 * that as "no condition filter applied" rather than "no specialties match".
 */
export function specialtiesForConditions(
  conditions: ConditionCategory[] | null | undefined,
): MedicalSpecialty[] | null {
  if (!conditions || conditions.length === 0) return null;
  const set = new Set<MedicalSpecialty>();
  for (const c of conditions) {
    const specs = CONDITION_TO_SPECIALTIES[c];
    if (!specs) continue;
    for (const s of specs) set.add(s);
  }
  return [...set];
}

/**
 * Human-readable labels for the API + i18n boundary. The frontend can keep
 * its own copy, but exposing them through `/onboarding/config` (or a
 * dedicated `/consultations/match-options`) gives a single source of truth
 * for the picker UIs.
 */
export const CONDITION_CATEGORY_LABELS: Record<ConditionCategory, string> = {
  general_wellness: 'General wellness',
  heart_circulation: 'Heart & circulation',
  skin: 'Skin',
  digestive_stomach: 'Digestive / stomach',
  diabetes_hormones: 'Diabetes & hormones',
  mental_health: 'Mental health',
  womens_health: "Women's health",
  childrens_health: "Children's health",
  bones_joints: 'Bones & joints',
  eyes: 'Eyes',
  ear_nose_throat: 'Ear, nose & throat',
  lungs_breathing: 'Lungs / breathing',
  kidney_urinary: 'Kidney / urinary',
  allergies: 'Allergies',
  cancer_oncology: 'Cancer / oncology',
  neurological: 'Neurological',
  dental: 'Dental',
  reproductive_health: 'Reproductive health',
  other: 'Other',
};

export const MEDICAL_SPECIALTY_LABELS: Record<MedicalSpecialty, string> = {
  general_practice: 'General Practice',
  internal_medicine: 'Internal Medicine',
  cardiology: 'Cardiology',
  dermatology: 'Dermatology',
  endocrinology: 'Endocrinology',
  gastroenterology: 'Gastroenterology',
  gynecology_obstetrics: 'Obstetrics & Gynecology',
  hematology: 'Hematology',
  infectious_disease: 'Infectious Disease',
  neurology: 'Neurology',
  oncology: 'Oncology',
  ophthalmology: 'Ophthalmology',
  orthopedics: 'Orthopedics',
  ent_otolaryngology: 'ENT (Otolaryngology)',
  pediatrics: 'Pediatrics',
  psychiatry: 'Psychiatry',
  pulmonology: 'Pulmonology',
  rheumatology: 'Rheumatology',
  urology: 'Urology',
  nephrology: 'Nephrology',
  general_surgery: 'General Surgery',
  neurosurgery: 'Neurosurgery',
  dentistry: 'Dentistry',
  allergology: 'Allergology',
  plastic_surgery: 'Plastic Surgery',
  other: 'Other',
};

/**
 * Best-effort case-insensitive mapping from a free-text specialty (as
 * historically entered into `professionalProfile.specialty`) to the
 * canonical `MedicalSpecialty` enum. Used by:
 *   1. The doctor's profile-patch endpoint, to auto-fill
 *      `medicalSpecialty` when an unset doctor updates their free-text label.
 *   2. The one-time admin backfill script.
 *
 * Unknown strings return `null` — the caller should leave the column null
 * rather than guess. The doctor (or admin) can then pick from the dropdown.
 */
const FREE_TEXT_SPECIALTY_MAP: Record<string, MedicalSpecialty> = {
  // Direct enum keys (covers the new dropdown values).
  general_practice: MedicalSpecialty.general_practice,
  internal_medicine: MedicalSpecialty.internal_medicine,
  cardiology: MedicalSpecialty.cardiology,
  dermatology: MedicalSpecialty.dermatology,
  endocrinology: MedicalSpecialty.endocrinology,
  gastroenterology: MedicalSpecialty.gastroenterology,
  gynecology_obstetrics: MedicalSpecialty.gynecology_obstetrics,
  hematology: MedicalSpecialty.hematology,
  infectious_disease: MedicalSpecialty.infectious_disease,
  neurology: MedicalSpecialty.neurology,
  oncology: MedicalSpecialty.oncology,
  ophthalmology: MedicalSpecialty.ophthalmology,
  orthopedics: MedicalSpecialty.orthopedics,
  ent_otolaryngology: MedicalSpecialty.ent_otolaryngology,
  pediatrics: MedicalSpecialty.pediatrics,
  psychiatry: MedicalSpecialty.psychiatry,
  pulmonology: MedicalSpecialty.pulmonology,
  rheumatology: MedicalSpecialty.rheumatology,
  urology: MedicalSpecialty.urology,
  nephrology: MedicalSpecialty.nephrology,
  general_surgery: MedicalSpecialty.general_surgery,
  neurosurgery: MedicalSpecialty.neurosurgery,
  dentistry: MedicalSpecialty.dentistry,
  allergology: MedicalSpecialty.allergology,
  plastic_surgery: MedicalSpecialty.plastic_surgery,

  // Common human-readable aliases. Lowercased keys; the lookup is
  // case-insensitive via `inferMedicalSpecialty`.
  'general practice': MedicalSpecialty.general_practice,
  'family medicine': MedicalSpecialty.general_practice,
  'family practice': MedicalSpecialty.general_practice,
  gp: MedicalSpecialty.general_practice,
  'internal medicine': MedicalSpecialty.internal_medicine,
  internist: MedicalSpecialty.internal_medicine,
  cardiologist: MedicalSpecialty.cardiology,
  dermatologist: MedicalSpecialty.dermatology,
  endocrinologist: MedicalSpecialty.endocrinology,
  gastroenterologist: MedicalSpecialty.gastroenterology,
  obgyn: MedicalSpecialty.gynecology_obstetrics,
  'ob/gyn': MedicalSpecialty.gynecology_obstetrics,
  'obstetrics and gynecology': MedicalSpecialty.gynecology_obstetrics,
  'obstetrics & gynecology': MedicalSpecialty.gynecology_obstetrics,
  gynecology: MedicalSpecialty.gynecology_obstetrics,
  obstetrics: MedicalSpecialty.gynecology_obstetrics,
  hematologist: MedicalSpecialty.hematology,
  'infectious disease': MedicalSpecialty.infectious_disease,
  neurologist: MedicalSpecialty.neurology,
  oncologist: MedicalSpecialty.oncology,
  ophthalmologist: MedicalSpecialty.ophthalmology,
  'eye doctor': MedicalSpecialty.ophthalmology,
  orthopedist: MedicalSpecialty.orthopedics,
  orthopaedics: MedicalSpecialty.orthopedics,
  ent: MedicalSpecialty.ent_otolaryngology,
  otolaryngology: MedicalSpecialty.ent_otolaryngology,
  pediatrician: MedicalSpecialty.pediatrics,
  paediatrics: MedicalSpecialty.pediatrics,
  psychiatrist: MedicalSpecialty.psychiatry,
  pulmonologist: MedicalSpecialty.pulmonology,
  rheumatologist: MedicalSpecialty.rheumatology,
  urologist: MedicalSpecialty.urology,
  nephrologist: MedicalSpecialty.nephrology,
  surgeon: MedicalSpecialty.general_surgery,
  'general surgery': MedicalSpecialty.general_surgery,
  neurosurgeon: MedicalSpecialty.neurosurgery,
  dentist: MedicalSpecialty.dentistry,
  allergist: MedicalSpecialty.allergology,
  allergy: MedicalSpecialty.allergology,
  'plastic surgeon': MedicalSpecialty.plastic_surgery,
};

export function inferMedicalSpecialty(
  freeText: string | null | undefined,
): MedicalSpecialty | null {
  if (!freeText) return null;
  const key = freeText.trim().toLowerCase();
  if (key.length === 0) return null;
  return FREE_TEXT_SPECIALTY_MAP[key] ?? null;
}
