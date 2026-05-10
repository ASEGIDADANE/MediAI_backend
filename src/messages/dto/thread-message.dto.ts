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

/**
 * One row in the calling user's "Messages" inbox. Both doctor- and patient-side
 * inboxes use this same shape so the dashboard navbar / list components can be
 * shared. The caller's role determines which "side" they are; `unreadCount` is
 * always counted from the caller's perspective (messages addressed to them).
 */
export class ThreadSummaryDto {
  @ApiProperty()
  threadId: string;

  @ApiProperty()
  doctorUserId: string;

  @ApiProperty()
  doctorName: string;

  @ApiPropertyOptional({ nullable: true })
  doctorSpecialty: string | null;

  @ApiProperty()
  patientUserId: string;

  @ApiProperty()
  patientName: string;

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
      'Number of inbound messages (sent by the other participant) that the caller has not read yet.',
  })
  unreadCount: number;
}

export class ThreadListDto {
  @ApiProperty({ type: [ThreadSummaryDto] })
  items: ThreadSummaryDto[];
}

/**
 * Aggregated unread count across every thread the caller participates in.
 * Used by the dashboard navbar message-icon badge.
 */
export class UnreadCountDto {
  @ApiProperty({
    description:
      'Total number of unread inbound messages addressed to the caller across all their threads.',
  })
  count: number;
}
