import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const ADMIN_RECENT_ACTIVITY_MAX_LIMIT = 50;
export const ADMIN_RECENT_ACTIVITY_DEFAULT_LIMIT = 20;

export class AdminRecentActivityQueryDto {
  @ApiPropertyOptional({
    default: ADMIN_RECENT_ACTIVITY_DEFAULT_LIMIT,
    maximum: ADMIN_RECENT_ACTIVITY_MAX_LIMIT,
    description: 'How many of the most-recent merged activity items to return.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ADMIN_RECENT_ACTIVITY_MAX_LIMIT)
  limit?: number;
}

export function clampActivityLimit(limit?: number): number {
  if (!limit || !Number.isFinite(limit)) {
    return ADMIN_RECENT_ACTIVITY_DEFAULT_LIMIT;
  }
  return Math.min(
    ADMIN_RECENT_ACTIVITY_MAX_LIMIT,
    Math.max(1, Math.trunc(limit)),
  );
}
