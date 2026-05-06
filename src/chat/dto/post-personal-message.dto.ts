import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

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

  /**
   * Professional clinical-assistant context. When set, the caller MUST be a
   * professional user, the patient MUST exist, and the LLM is fed the
   * patient's profile/medical history (not the doctor's). Conversations are
   * keyed by `(callerUserId, patientUserId)` so each patient has their own
   * thread set per doctor.
   */
  @ApiPropertyOptional({
    description:
      "Subject patient's userId for the clinical assistant. Doctor-only.",
    format: 'uuid',
  })
  @IsOptional()
  @IsString()
  @IsUUID('4')
  patientUserId?: string;
}
