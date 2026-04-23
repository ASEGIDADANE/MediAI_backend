import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class PostPersonalMessageDto {
  @ApiProperty({ example: 'I have a headache in the morning.', maxLength: 8000 })
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  message: string;

  @ApiPropertyOptional({ description: 'Continues an existing personal thread' })
  @IsOptional()
  @IsString()
  conversationId?: string;
}
