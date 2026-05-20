import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  ConsultationBookingStatus,
  ConsultationRefundStatus,
  ConsultationType,
} from '../../generated/prisma/client';

export class CreateConsultationBookingDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  topDoctorId: string;

  @ApiProperty({ enum: ConsultationType })
  @IsEnum(ConsultationType)
  consultationType: ConsultationType;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  patientNotes?: string;

  @ApiPropertyOptional({
    description:
      'UTC ISO-8601 start of the chosen slot (matches `startsAt` returned by `/api/doctors/:id/availability/slots`). When omitted, the booking is unscheduled — useful only for legacy/admin flows; new patient bookings should always send a slot.',
    example: '2026-06-15T09:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  startsAt?: string;
}

export class CancelConsultationBookingDto {
  @ApiPropertyOptional({
    maxLength: 500,
    description:
      'Optional free-text reason. Stored verbatim on the booking and visible to the other party.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ConsultationBookingResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  topDoctorId: string;

  @ApiProperty()
  topDoctorName: string;

  @ApiProperty({ enum: ConsultationType })
  consultationType: ConsultationType;

  @ApiProperty({ enum: ConsultationBookingStatus })
  status: ConsultationBookingStatus;

  @ApiProperty()
  consultationFeeCents: number;

  @ApiProperty()
  consultationFeeDisplay: string;

  @ApiProperty()
  currency: string;

  @ApiProperty({ nullable: true })
  patientNotes: string | null;

  @ApiProperty({ nullable: true, description: 'ISO 8601' })
  paidAt: string | null;

  @ApiPropertyOptional()
  chapaTxRef?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'UTC ISO-8601 start of the appointment (when scheduled).',
  })
  startsAt?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'UTC ISO-8601 end of the appointment. Computed as `startsAt + durationMinutes`. Null for unscheduled bookings.',
  })
  endsAt?: string | null;

  @ApiPropertyOptional({
    description: 'Length of the appointment in minutes.',
    example: 30,
  })
  durationMinutes?: number;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Reason the doctor entered when rejecting. Null for non-rejected bookings.',
  })
  doctorDecisionReason?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Free-text cancellation reason (set when status=cancelled).',
  })
  cancelReason?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Whichever side pressed cancel (patient or doctor User.id).',
  })
  cancelledByUserId?: string | null;

  @ApiPropertyOptional({
    enum: ConsultationRefundStatus,
    description:
      'Refund bookkeeping state. `none` for un-paid or non-cancelled bookings.',
  })
  refundStatus?: ConsultationRefundStatus;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Phase 4 — video/meeting link the doctor attached for this consultation. Always null until the doctor approves the booking (the API blanks it on the wire for `pending_payment` / `pending_doctor_approval` rows even if a value is set in the DB).',
  })
  meetingLink?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'UTC ISO-8601 of when the meeting link was last set.',
  })
  meetingLinkSetAt?: string | null;

  @ApiProperty({ description: 'ISO 8601' })
  createdAt: string;

  @ApiProperty({ description: 'ISO 8601' })
  updatedAt: string;
}

export class ConsultationBookingListResponseDto {
  @ApiProperty({ type: [ConsultationBookingResponseDto] })
  items: ConsultationBookingResponseDto[];
}
