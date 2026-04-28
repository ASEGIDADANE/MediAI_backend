import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { HealthcareFacilityType } from '../../generated/prisma/client';

const MAX_PAGE_SIZE = 50;
const Q_MAX = 120;

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
  @IsString()
  @MinLength(0)
  @MaxLength(Q_MAX)
  q?: string;
}

export function takeSkipHealthFacilities(page?: number, pageSize?: number) {
  const p = Math.max(1, page ?? 1);
  const s = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize ?? 20));
  return { take: s, skip: (p - 1) * s, page: p, pageSize: s };
}
