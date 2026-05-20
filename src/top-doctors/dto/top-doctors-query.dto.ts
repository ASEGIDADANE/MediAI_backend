import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  ConditionCategory,
  ConsultationType,
  MedicalSpecialty,
} from '../../generated/prisma/client';

const MAX_PAGE_SIZE = 50;
const Q_MAX = 120;

/**
 * Helper: accept either `?conditions=a,b` (comma-separated, easier to type)
 * or `?conditions=a&conditions=b` (canonical). Both produce a real string
 * array before class-validator gets to it.
 */
function csvOrArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    return value.map(String).filter((s) => s.length > 0);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return undefined;
}

export class TopDoctorsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: MAX_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;

  @ApiPropertyOptional({
    description:
      'Free-text filter on `professionalProfile.specialty` (case-insensitive). Phase 5 — prefer `medicalSpecialty` for structured matching.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  specialty?: string;

  @ApiPropertyOptional({
    description:
      'Case-insensitive search in name, specialty, sub-specialty, and diseases list (as JSON text). Max 120 chars.',
  })
  @IsOptional()
  @IsString()
  @MinLength(0)
  @MaxLength(Q_MAX)
  q?: string;

  /**
   * Phase 5 — primary filter for smart matching. One or more condition
   * categories; the service expands each into a list of `MedicalSpecialty`
   * codes and filters doctors whose `medicalSpecialty` is in the union.
   * Doctors without a canonical specialty are *not* dropped when this filter
   * is absent, but they fall to the bottom of the sort when it is present.
   */
  @ApiPropertyOptional({
    enum: ConditionCategory,
    isArray: true,
    description:
      'Patient-facing condition categories. Accepts CSV (?conditions=skin,allergies) or repeated query params.',
  })
  @IsOptional()
  @Transform(({ value }) => csvOrArray(value))
  @IsArray()
  @ArrayMaxSize(12)
  @IsEnum(ConditionCategory, { each: true })
  conditions?: ConditionCategory[];

  /**
   * Phase 5 — narrow to doctors who accept this consultation type. Backed by
   * `DoctorCapacity.acceptedConsultationTypes` (JSON array; empty = accepts
   * all). For `in_person` / `hybrid` this also boosts in-region doctors.
   */
  @ApiPropertyOptional({ enum: ConsultationType })
  @IsOptional()
  @IsEnum(ConsultationType)
  consultationType?: ConsultationType;

  /**
   * Phase 5 — explicit specialty filter (escape hatch for admins / power
   * users). Takes precedence over `conditions` when both are sent.
   */
  @ApiPropertyOptional({
    enum: MedicalSpecialty,
    isArray: true,
    description:
      'Filter directly by canonical specialty. Accepts CSV or repeated query params.',
  })
  @IsOptional()
  @Transform(({ value }) => csvOrArray(value))
  @IsArray()
  @ArrayMaxSize(MAX_PAGE_SIZE)
  @IsEnum(MedicalSpecialty, { each: true })
  medicalSpecialties?: MedicalSpecialty[];

  /**
   * Phase 5 — for `in_person` / `hybrid` consultation types, when the
   * caller is anonymous (no logged-in patient) we accept an explicit
   * `region` query param. Authenticated patients have it inferred from
   * their profile and don't need to pass this.
   */
  @ApiPropertyOptional({
    description: 'Explicit region filter (overrides inferred patient region).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  region?: string;
}

export function takeSkipTopDoctors(page?: number, pageSize?: number) {
  const p = Math.max(1, page ?? 1);
  const s = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize ?? 20));
  return { take: s, skip: (p - 1) * s, page: p, pageSize: s };
}
