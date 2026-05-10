import type { TopDoctorDto } from './dto/top-doctor-response.dto';

/**
 * Best-effort mapping from `UserProfile.professionalProfile` JSON (the doctor's
 * own verification packet) to the public `TopDoctorDto` shape consumed by
 * `/dashboard/top-doctors`.
 *
 * The transform is deliberately defensive: every JSON field is optional, so
 * the doctor can ship a minimal verified profile (license + bio + specialty)
 * and the page still renders without crashes. Where data is missing the
 * mapper returns sane defaults (`""`, `0`, `[]`) so existing UI code that
 * assumes a non-null value continues to work.
 */
export function userProfileRowToTopDoctorDto(row: {
  userId: string;
  preferredName: string;
  professionalProfile: unknown;
}): TopDoctorDto {
  const prof = isObject(row.professionalProfile) ? row.professionalProfile : {};

  const fullName =
    asNonEmptyString(prof.fullName) ?? row.preferredName.trim() ?? '';
  const title = asString(prof.title);
  const specialty = asString(prof.specialty);
  const role = asNonEmptyString(prof.role) ?? specialty ?? title ?? 'Doctor';

  return {
    id: row.userId,
    name: fullName,
    role,
    specialty,
    subSpecialty: asString(prof.subSpecialty),
    yearsOfExperience: asNonNegativeInt(prof.yearsOfExperience),
    consultationFees: {
      video: asNonNegativeInt(prof.videoConsultationFee),
      written: asNonNegativeInt(prof.writtenConsultationFee),
    },
    heroImageUrl: asString(prof.heroImageUrl),
    education: {
      degree: asString(prof.educationDegree),
      year: asString(prof.educationYear),
    },
    biography: asStringArray(prof.biographyParagraphs ?? splitBio(prof.bio)),
    experience: asExpArray(prof.experienceItems),
    affiliations: asExpArray(prof.affiliationItems),
    diseases: asStringArray(prof.diseases),
    publicationsSummary: asString(prof.publicationsSummary),
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function asNonEmptyString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function asNonNegativeInt(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
    return Math.trunc(v);
  }
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) return Math.trunc(n);
  }
  return 0;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
}

function asExpArray(v: unknown): { title: string; subtitle: string }[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (o): o is { title: string; subtitle: string } =>
        isObject(o) &&
        typeof o.title === 'string' &&
        typeof o.subtitle === 'string',
    )
    .map((o) => ({ title: o.title, subtitle: o.subtitle }));
}

/**
 * Split the doctor's free-form `bio` into paragraphs so the existing UI's
 * `biography: string[]` rendering still produces nice spacing when the doctor
 * only filled in the simple `bio` field.
 */
function splitBio(v: unknown): string[] {
  if (typeof v !== 'string') return [];
  return v
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
