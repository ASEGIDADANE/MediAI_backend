import { ApiProperty } from '@nestjs/swagger';

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
}
