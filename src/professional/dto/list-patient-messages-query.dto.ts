import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

const MAX_LIMIT = 200;

export class ListPatientMessagesQueryDto {
  @ApiPropertyOptional({
    default: 50,
    maximum: MAX_LIMIT,
    description:
      'Maximum messages to return (newest first if `before`, otherwise oldest first).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number;
}

export function clampMessageLimit(limit?: number) {
  return Math.min(MAX_LIMIT, Math.max(1, limit ?? 50));
}
