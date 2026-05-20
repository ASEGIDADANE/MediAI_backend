import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

const MAX_PAGE_SIZE = 50;

/**
 * Phase 6 — query string for `GET /me/notifications`. Mirrors the pagination
 * shape used by `/top-doctors` and `/professional/appointments`.
 */
export class NotificationsQueryDto {
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

  /**
   * When `true` only unread notifications are returned. Defaults to false
   * so the bell dropdown can show a recent-everything view.
   */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  unreadOnly?: boolean;
}

export function takeSkipNotifications(page?: number, pageSize?: number) {
  const p = Math.max(1, page ?? 1);
  const s = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize ?? 20));
  return { take: s, skip: (p - 1) * s, page: p, pageSize: s };
}
