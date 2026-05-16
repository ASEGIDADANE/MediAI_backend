import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
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
}
