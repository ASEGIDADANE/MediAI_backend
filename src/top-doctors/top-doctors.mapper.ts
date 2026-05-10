import type { Prisma, TopDoctor } from '../generated/prisma/client';
import { TopDoctorDto } from './dto/top-doctor-response.dto';

function asStringArray(v: Prisma.JsonValue): string[] {
  if (!Array.isArray(v)) {
    return [];
  }
  return v.filter((x) => typeof x === 'string');
}

function asExpArray(
  v: Prisma.JsonValue,
): { title: string; subtitle: string }[] {
  if (!Array.isArray(v)) {
    return [];
  }
  return v
    .filter((o): o is { title: string; subtitle: string } => {
      return (
        o !== null &&
        typeof o === 'object' &&
        'title' in o &&
        'subtitle' in o &&
        typeof (o as { title: unknown }).title === 'string' &&
        typeof (o as { subtitle: unknown }).subtitle === 'string'
      );
    })
    .map((o) => ({ title: o.title, subtitle: o.subtitle }));
}

/**
 * Map Prisma `TopDoctor` row to MediAI `TopDoctor` API shape
 * (`src/lib/top-doctors-content.ts`).
 */
export function toTopDoctorDto(row: TopDoctor): TopDoctorDto {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    specialty: row.specialty,
    subSpecialty: row.subSpecialty,
    yearsOfExperience: row.yearsOfExperience,
    consultationFees: { video: row.videoFee, written: row.writtenFee },
    heroImageUrl: row.heroImageUrl,
    education: { degree: row.educationDegree, year: row.educationYear },
    biography: asStringArray(row.biography),
    experience: asExpArray(row.experience),
    affiliations: asExpArray(row.affiliations),
    diseases: asStringArray(row.diseases),
    publicationsSummary: row.publicationsSummary,
  };
}
