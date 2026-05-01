import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

const MAX_PAGE_SIZE = 50;
const Q_MAX = 120;

/** Admin list: same pagination/search as public list, plus optional `published` filter. */
export class BlogAdminArticlesQueryDto {
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

  @ApiPropertyOptional({ description: 'Filter by category (case-insensitive equality)' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string;

  @ApiPropertyOptional({
    description: 'Search in title and intro (max 120 chars, ILIKE)',
  })
  @IsOptional()
  @IsString()
  @MinLength(0)
  @MaxLength(Q_MAX)
  q?: string;

  @ApiPropertyOptional({
    enum: ['all', 'true', 'false'],
    default: 'all',
    description: 'Published filter; default lists drafts and live posts',
  })
  @IsOptional()
  @IsIn(['all', 'true', 'false'])
  published?: 'all' | 'true' | 'false';
}

export function takeSkipBlogAdminArticles(page?: number, pageSize?: number) {
  const p = Math.max(1, page ?? 1);
  const s = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize ?? 20));
  return { take: s, skip: (p - 1) * s, page: p, pageSize: s };
}
