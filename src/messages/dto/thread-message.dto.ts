import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Single message inside a `DoctorPatientThread`, expressed from the patient's
 * perspective. `sender` says who *wrote* the message, and `mine` says whether
 * the *caller* (the patient hitting `/me/messages/*`) wrote it.
 */
export class ThreadMessageDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  threadId: string;

  @ApiProperty({ enum: ['doctor', 'patient'] })
  sender: 'doctor' | 'patient';

  @ApiProperty()
  senderUserId: string;

  @ApiProperty({
    description:
      'True when the message was authored by the calling patient — convenient for the chat UI.',
  })
  mine: boolean;

  @ApiProperty()
  body: string;

  @ApiProperty()
  createdAt: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'ISO timestamp when the *recipient* read this message.',
  })
  readAt: string | null;
}

/** A thread + the doctor on the other side + the visible messages. */
export class ThreadDetailDto {
  @ApiProperty()
  threadId: string;

  @ApiProperty()
  doctorUserId: string;

  @ApiProperty()
  doctorName: string;

  @ApiPropertyOptional({ nullable: true })
  doctorSpecialty: string | null;

  @ApiProperty({ type: [ThreadMessageDto] })
  messages: ThreadMessageDto[];
}

/** One row in the patient's "Messages" inbox. */
export class ThreadSummaryDto {
  @ApiProperty()
  threadId: string;

  @ApiProperty()
  doctorUserId: string;

  @ApiProperty()
  doctorName: string;

  @ApiPropertyOptional({ nullable: true })
  doctorSpecialty: string | null;

  @ApiProperty({ description: 'ISO timestamp of last activity in the thread.' })
  lastMessageAt: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Truncated body of the most recent message (max 200 chars).',
  })
  lastMessagePreview: string | null;

  @ApiPropertyOptional({
    nullable: true,
    enum: ['doctor', 'patient'],
    description: 'Who authored the most recent message.',
  })
  lastMessageSender: 'doctor' | 'patient' | null;

  @ApiProperty({
    description:
      'Number of doctor → patient messages that have not been read by the patient yet.',
  })
  unreadCount: number;
}

export class ThreadListDto {
  @ApiProperty({ type: [ThreadSummaryDto] })
  items: ThreadSummaryDto[];
}
