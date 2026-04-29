import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { HealthcareFacilityType } from '../../generated/prisma/client';

const MAX_PAGE_SIZE = 50;
const Q_MAX = 120;
const RADIUS_DEFAULT_KM = 10;
const RADIUS_MAX_KM = 100;
const RADIUS_MIN_KM = 0.5;

export class HealthFacilitiesQueryDto {
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

  @ApiPropertyOptional({ enum: HealthcareFacilityType })
  @IsOptional()
  @IsEnum(HealthcareFacilityType)
  type?: HealthcareFacilityType;

  @ApiPropertyOptional({
    description: 'Search name and address (case-insensitive, max 120 chars)',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(Q_MAX)
  q?: string;

  @ApiPropertyOptional({
    description:
      'User latitude in decimal degrees. When `lat` and `lng` are both set the response is sorted by distance (Haversine) and `distanceKm` is included for each item.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({
    description: 'User longitude in decimal degrees (paired with `lat`).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({
    default: RADIUS_DEFAULT_KM,
    minimum: RADIUS_MIN_KM,
    maximum: RADIUS_MAX_KM,
    description:
      'Search radius in kilometres (only used when `lat` and `lng` are provided).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(RADIUS_MIN_KM)
  @Max(RADIUS_MAX_KM)
  radiusKm?: number;
}

export function takeSkipHealthFacilities(page?: number, pageSize?: number) {
  const p = Math.max(1, page ?? 1);
  const s = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize ?? 20));
  return { take: s, skip: (p - 1) * s, page: p, pageSize: s };
}

export const HEALTH_FACILITIES_RADIUS_DEFAULT_KM = RADIUS_DEFAULT_KM;
