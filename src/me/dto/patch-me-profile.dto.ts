import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import {
  ConditionCategory,
  MedicalSpecialty,
} from '../../generated/prisma/client';
import { ETHIOPIAN_REGIONS_LIST } from '../../onboarding/onboarding.constants';

const FEATURES = ['ai-doctor', 'top-doctors', 'lab-test-interpretation'] as const;

export const MAX_PROFILE_JSON_CHARS = 28_000;

/**
 * Partial update of dashboard / UserProfile (merge semantics in service).
 */
export class PatchMeProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  preferredName?: string;

  /// String as in the frontend (`DashboardProfile.age`).
  @ApiPropertyOptional({ example: '48' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  age?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsIn(ETHIOPIAN_REGIONS_LIST)
  region?: string;

  @ApiPropertyOptional({ enum: ['imperial', 'metric'] })
  @IsOptional()
  @IsIn(['imperial', 'metric'])
  measurementSystem?: 'imperial' | 'metric';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(16)
  weight?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4)
  heightFeet?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4)
  heightInches?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5)
  heightCm?: string;

  @ApiPropertyOptional({ enum: ['male', 'female', 'other'] })
  @IsOptional()
  @IsIn(['male', 'female', 'other'])
  sexAtBirth?: 'male' | 'female' | 'other';

  @ApiPropertyOptional({ enum: [...FEATURES] })
  @IsOptional()
  @IsIn([...FEATURES])
  preferredFeature?: (typeof FEATURES)[number];

  /// Merged with existing `professionalProfile` in the service.
  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  professionalProfile?: Record<string, unknown>;

  /**
   * Phase 5 — patient's primary health concerns (multi-select). Replaces the
   * full array on PATCH; pass `[]` to clear. Server-side max-cap mirrors the
   * frontend picker UI so abusive payloads can't blow up the response.
   */
  @ApiPropertyOptional({
    enum: ConditionCategory,
    isArray: true,
    description:
      'Phase 5 — patient-facing concerns. Server uses these to expand into specialties when filtering /top-doctors. Empty array means "no preferences"; the field is meaningless for professional users.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsEnum(ConditionCategory, { each: true })
  primaryConditions?: ConditionCategory[];

  /**
   * Phase 5 — canonical specialty (doctor only). The doctor may keep
   * setting the free-text `professionalProfile.specialty` for display; if
   * this enum is sent the service writes the dedicated column used by the
   * matching SQL filter.
   */
  @ApiPropertyOptional({
    enum: MedicalSpecialty,
    description:
      'Phase 5 — canonical specialty for matching. Only honored when the caller is a professional.',
  })
  @IsOptional()
  @IsEnum(MedicalSpecialty)
  medicalSpecialty?: MedicalSpecialty;
}
