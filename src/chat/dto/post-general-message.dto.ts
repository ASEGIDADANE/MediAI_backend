import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class PostGeneralMessageDto {
  @ApiProperty({ example: 'What are common causes of occasional headaches?' })
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  message: string;

  @ApiPropertyOptional({
    description:
      'Client-generated id to continue the same general thread (not PHI)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  sessionId?: string;
}
