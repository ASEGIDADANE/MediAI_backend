import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ConsultationType,
  MedicalSpecialty,
} from '../../generated/prisma/client';

export class ConsultationFeesDto {
  @ApiProperty({
    example: 490,
    description: 'Video consultation — USD whole dollars',
  })
  video!: number;

  @ApiProperty({
    example: 490,
    description: 'Written consultation — USD whole dollars',
  })
  written!: number;
}

export class TopDoctorEducationDto {
  @ApiProperty()
  degree!: string;

  @ApiProperty()
  year!: string;
}

export class TopDoctorExperienceItemDto {
  @ApiProperty()
  title!: string;

  @ApiProperty()
  subtitle!: string;
}

/** Matches MediAI `src/lib/top-doctors-content.ts` `TopDoctor`. */
export class TopDoctorDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  role!: string;

  @ApiProperty()
  specialty!: string;

  @ApiProperty()
  subSpecialty!: string;

  @ApiProperty()
  yearsOfExperience!: number;

  @ApiProperty()
  consultationFees!: ConsultationFeesDto;

  @ApiProperty()
  heroImageUrl!: string;

  @ApiProperty()
  education!: TopDoctorEducationDto;

  @ApiProperty({ type: [String] })
  biography!: string[];

  @ApiProperty({ type: [TopDoctorExperienceItemDto] })
  experience!: TopDoctorExperienceItemDto[];

  @ApiProperty({ type: [TopDoctorExperienceItemDto] })
  affiliations!: TopDoctorExperienceItemDto[];

  @ApiProperty()
  diseases!: string[];

  @ApiProperty()
  publicationsSummary!: string;

  /**
   * Phase 5 — canonical specialty enum (matching layer). Null when the
   * doctor's free-text specialty hasn't been mapped yet. The frontend
   * should still display `specialty` (the free-text label); the enum is
   * what the matching SQL uses.
   */
  @ApiPropertyOptional({ enum: MedicalSpecialty, nullable: true })
  medicalSpecialty?: MedicalSpecialty | null;

  /**
   * Phase 5 — doctor's region (e.g. "Addis Ababa"). Surfaced so the
   * `/top-doctors` UI can render an "in your region" pill without an extra
   * fetch.
   */
  @ApiPropertyOptional({ nullable: true })
  region?: string | null;

  /**
   * Phase 5 — true when the doctor's region matches the caller's region.
   * Computed server-side from the JWT-authenticated patient (or from the
   * `?region=` query param). When the caller is anonymous this is omitted.
   */
  @ApiPropertyOptional()
  inRegion?: boolean;

  /**
   * Phase 5 — true when this doctor's `medicalSpecialty` matches one of the
   * specialties expanded from the patient's `conditions` query (or the
   * explicit `medicalSpecialties` query). When no condition filter is
   * present this is omitted so the UI knows not to render the "matches your
   * concerns" badge.
   */
  @ApiPropertyOptional()
  matchesConditions?: boolean;

  /**
   * Phase 5 — consultation methods the doctor has opted into. Empty array
   * means "all methods" (the default). Surfaced so the booking UI can pre-
   * select the right consultation-type radio and disable the rest.
   */
  @ApiPropertyOptional({ enum: ConsultationType, isArray: true })
  acceptedConsultationTypes?: ConsultationType[];
}

export class TopDoctorsListResponseDto {
  @ApiProperty({ type: [TopDoctorDto] })
  items!: TopDoctorDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;

  @ApiProperty()
  total!: number;
}

export class TopDoctorSpecialtiesResponseDto {
  @ApiProperty({ type: [String], description: 'Sorted distinct specialties' })
  specialties!: string[];
}

/**
 * Phase 5 — option lists for the patient's "primary concerns" picker and
 * the doctor's "canonical specialty" dropdown. The frontend keeps a static
 * copy too (so the wizards work offline), but the backend list is the
 * source of truth.
 */
export class EnumOptionDto {
  @ApiProperty({ description: 'Enum value (passed back to the API as-is).' })
  value!: string;

  @ApiProperty({ description: 'Human-readable label for the UI.' })
  label!: string;
}

export class ConditionMatchOptionsDto {
  @ApiProperty({ type: [EnumOptionDto] })
  conditionCategories!: EnumOptionDto[];

  @ApiProperty({ type: [EnumOptionDto] })
  medicalSpecialties!: EnumOptionDto[];
}
