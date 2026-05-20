import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationType } from '../../generated/prisma/client';

/**
 * Phase 6 — single notification row as seen by the patient/doctor in their
 * bell dropdown. `metadata` is intentionally `Record<string, unknown>` so
 * we can extend per-type payloads without bumping this DTO.
 */
export class NotificationItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: NotificationType })
  type!: NotificationType;

  @ApiProperty({ example: 'Your consultation request was approved' })
  title!: string;

  @ApiProperty({
    example:
      'Dr. Ayele accepted your request. Open the meeting link or chat now.',
  })
  body!: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Optional in-app deep link the bell dropdown navigates to on click.',
    example: '/dashboard/consultations',
  })
  actionUrl?: string | null;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      'Structured payload — booking id, counterparty name, etc. Type-specific.',
  })
  metadata?: Record<string, unknown> | null;

  @ApiPropertyOptional({ nullable: true, description: 'ISO 8601; null when unread.' })
  readAt!: string | null;

  @ApiProperty({ description: 'ISO 8601' })
  createdAt!: string;
}

export class NotificationListResponseDto {
  @ApiProperty({ type: [NotificationItemDto] })
  items!: NotificationItemDto[];

  @ApiProperty({
    description:
      'Total notifications matching the filter (used for pagination).',
  })
  total!: number;

  @ApiProperty({
    description:
      'Number of *unread* notifications overall for this user (independent of the current page filter).',
  })
  unreadCount!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;
}

export class NotificationUnreadCountDto {
  @ApiProperty({ example: 3 })
  count!: number;
}
