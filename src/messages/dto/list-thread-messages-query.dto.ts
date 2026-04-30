import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

const MAX_LIMIT = 200;

export class ListThreadMessagesQueryDto {
  @ApiPropertyOptional({
    default: 50,
    maximum: MAX_LIMIT,
    description:
      'Maximum messages to return, ordered oldest → newest. Defaults to 50.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number;
}

export function clampThreadMessageLimit(limit?: number) {
  return Math.min(MAX_LIMIT, Math.max(1, limit ?? 50));
}
