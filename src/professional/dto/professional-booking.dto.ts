import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  ConsultationBookingStatus,
  ConsultationRefundStatus,
  ConsultationType,
} from '../../generated/prisma/client';

/**
 * Shape returned to the doctor for both `/professional/booking-requests` and
 * `/professional/appointments`. Intentionally a doctor-flavoured projection of
 * `ConsultationBooking`: patient summary is included, doctor identity is
 * omitted (the doctor is the caller — they already know who they are).
 */
export class ProfessionalBookingDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'The patient User.id' })
  patientUserId!: string;

  @ApiProperty({
    description:
      "Patient display name (`UserProfile.preferredName`, falling back to email).",
  })
  patientName!: string;

  @ApiProperty({ enum: ConsultationType })
  consultationType!: ConsultationType;

  @ApiProperty({ enum: ConsultationBookingStatus })
  status!: ConsultationBookingStatus;

  @ApiProperty({
    nullable: true,
    description: 'UTC ISO-8601 start of the appointment.',
  })
  startsAt!: string | null;

  @ApiProperty({
    nullable: true,
    description:
      'UTC ISO-8601 end of the appointment (start + durationMinutes).',
  })
  endsAt!: string | null;

  @ApiProperty({ description: 'Slot length in minutes (default 30)' })
  durationMinutes!: number;

  @ApiProperty({ description: 'Fee in minor units (cents)' })
  consultationFeeCents!: number;

  @ApiProperty({ description: 'Pre-formatted price for display' })
  consultationFeeDisplay!: string;

  @ApiProperty()
  currency!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 2000 })
  patientNotes!: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'UTC ISO-8601' })
  paidAt!: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'UTC ISO-8601' })
  approvedAt!: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'UTC ISO-8601' })
  rejectedAt!: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'UTC ISO-8601' })
  completedAt!: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'UTC ISO-8601' })
  missedAt!: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'UTC ISO-8601' })
  cancelledAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  doctorDecisionReason!: string | null;

  @ApiPropertyOptional({ nullable: true })
  cancelReason!: string | null;

  @ApiPropertyOptional({ nullable: true })
  cancelledByUserId!: string | null;

  @ApiProperty({ enum: ConsultationRefundStatus })
  refundStatus!: ConsultationRefundStatus;

  @ApiPropertyOptional({
    nullable: true,
    maxLength: 1000,
    description:
      'Video / call link the doctor attached on approval (Phase 4). Null until the doctor either approves the booking with a link or PATCHes one in later. Patients only see this once `status` is past `pending_doctor_approval`.',
  })
  meetingLink!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'UTC ISO-8601 of when `meetingLink` was last written.',
  })
  meetingLinkSetAt!: string | null;

  @ApiProperty({ description: 'UTC ISO-8601' })
  createdAt!: string;

  @ApiProperty({ description: 'UTC ISO-8601' })
  updatedAt!: string;
}

export class ProfessionalBookingListDto {
  @ApiProperty({ type: () => [ProfessionalBookingDto] })
  items!: ProfessionalBookingDto[];
}

/**
 * Optional body for `POST /professional/bookings/:id/approve`. Phase 4 lets
 * the doctor optionally attach a meeting link in the same request that
 * approves the booking, since for `video`/`hybrid` consults the patient
 * needs the link the moment they open the booking detail.
 */
export class ApproveBookingDto {
  @ApiPropertyOptional({
    maxLength: 1000,
    description:
      'HTTP(S) URL of the meeting room (Google Meet / Zoom / WhereBy / etc). Stored on the booking and shown to the patient on the booking detail page.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'meetingLink must be a valid http(s) URL.' },
  )
  meetingLink?: string;
}

/**
 * Body for `PATCH /professional/bookings/:id/meeting-link`. Used when the
 * doctor wants to set or update the link after approval (e.g. a Zoom room
 * the clinic provisions just before the consult). Empty string clears the
 * link.
 */
export class SetMeetingLinkDto {
  @ApiProperty({
    maxLength: 1000,
    description:
      'New meeting link. Pass an empty string to clear the existing link.',
  })
  @IsString()
  @MaxLength(1000)
  meetingLink!: string;
}

/**
 * Doctor's reject request. The reason is required (and non-empty) so we don't
 * end up with a booking that's rejected without any explanation visible to
 * the patient.
 */
export class RejectBookingDto {
  @ApiProperty({
    minLength: 1,
    maxLength: 500,
    description:
      'Reason for the rejection. Shown verbatim to the patient and stored in `doctor_decision_reason`.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

/**
 * Doctor's cancel (after already approving). Reason is optional but encouraged
 * — the patient will see whatever the doctor types.
 */
export class CancelByDoctorDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
