import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ChatMessagesQueryDto {
  @ApiPropertyOptional({ default: 30, description: 'Max 100' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Message id — return messages **older** than this (cursor pagination).',
  })
  @IsOptional()
  @IsString()
  @IsUUID('4')
  before?: string;
}
