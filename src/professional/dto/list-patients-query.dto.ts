import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const MAX_PAGE_SIZE = 100;
const Q_MAX = 120;

export class ListPatientsQueryDto {
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
      'Substring match on the patient preferred name and email (case-insensitive, max 120 chars).',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(Q_MAX)
  q?: string;
}

export function takeSkipFromListPatients(page?: number, pageSize?: number) {
  const p = Math.max(1, page ?? 1);
  const s = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize ?? 20));
  return { take: s, skip: (p - 1) * s, page: p, pageSize: s };
}
