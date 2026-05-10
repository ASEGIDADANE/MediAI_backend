import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AdminRejectVerificationDto {
  @ApiProperty({
    description:
      'Reason shown to the doctor. Required so they know what to fix before re-submitting.',
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  notes: string;
}
