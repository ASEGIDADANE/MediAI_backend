import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

const MAX_PAGE_SIZE = 100;

export class AdminPaginationQueryDto {
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
}

export function takeSkipFromPagination(page?: number, pageSize?: number) {
  const p = Math.max(1, page ?? 1);
  const s = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize ?? 20));
  return { take: s, skip: (p - 1) * s, page: p, pageSize: s };
}
