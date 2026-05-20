import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PatientMessageDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  threadId: string;

  @ApiProperty({ enum: ['doctor', 'patient'] })
  sender: 'doctor' | 'patient';

  @ApiProperty()
  senderUserId: string;

  @ApiProperty()
  body: string;

  @ApiProperty()
  createdAt: string;
}

export class PatientMessageThreadDto {
  @ApiProperty()
  threadId: string;

  @ApiProperty()
  patientId: string;

  @ApiProperty()
  patientName: string;

  @ApiProperty({ type: [PatientMessageDto] })
  messages: PatientMessageDto[];

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Phase 4 — ISO timestamp when the consultation chat window closes for this doctor↔patient pair. Null when no booking is currently active (the doctor can still read past messages but cannot send new ones until the patient books a follow-up).',
  })
  chatWindowEndsAt: string | null;
}
