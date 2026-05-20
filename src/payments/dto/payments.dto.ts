import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import {
  AssistantAccessStatus,
  ConsultationBookingStatus,
  ConsultationType,
  SubscriptionInterval,
  SubscriptionStatus,
} from '../../generated/prisma/client';

export class AssistantAccessPlanResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true })
  description: string | null;

  @ApiProperty()
  priceCents: number;

  @ApiProperty()
  currency: string;

  @ApiProperty()
  priceDisplay: string;

  @ApiProperty()
  durationDays: number;

  @ApiProperty()
  active: boolean;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;
}

export class AssistantAccessPlanListResponseDto {
  @ApiProperty({ type: [AssistantAccessPlanResponseDto] })
  items: AssistantAccessPlanResponseDto[];
}

export class InitiateAssistantPaymentBodyDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  planId: string;
}

export class InitiateChapaPaymentResponseDto {
  @ApiProperty()
  txRef: string;

  @ApiPropertyOptional({
    format: 'uri',
    description:
      'Hosted Chapa checkout URL to redirect to. **Omitted** when the user picked the Free plan — in that case `freeGranted` is true and the caller can route straight back to the dashboard.',
  })
  checkoutUrl?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  accessId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  bookingId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  subscriptionId?: string;

  @ApiPropertyOptional({
    description:
      'Phase 7 — true when the user selected the Free plan. No Chapa redirect happens; the subscription was upserted server-side as active and the client should just navigate home.',
  })
  freeGranted?: boolean;
}

// --- Phase 7: subscription plans + checkout DTOs ----------------------------

export class InitiateSubscriptionPaymentBodyDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  planId: string;

  @ApiProperty({ enum: SubscriptionInterval })
  @IsEnum(SubscriptionInterval)
  interval: SubscriptionInterval;
}

export class SubscriptionPlanPublicResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true })
  description: string | null;

  @ApiProperty()
  monthlyPriceCents: number;

  @ApiProperty()
  yearlyPriceCents: number;

  @ApiProperty({
    description:
      'Pre-formatted monthly price string ("ETB 399.00") for direct UI rendering.',
  })
  monthlyPriceDisplay: string;

  @ApiProperty({ description: 'Pre-formatted yearly price string.' })
  yearlyPriceDisplay: string;

  @ApiProperty()
  currency: string;

  @ApiProperty({
    type: [String],
    description: 'Feature bullet points displayed under the plan card.',
  })
  features: string[];

  @ApiProperty({
    description:
      'True for the seeded "Free" tier — the only plan that auto-grants access without a Chapa redirect.',
  })
  isFree: boolean;

  @ApiProperty()
  sortOrder: number;
}

export class SubscriptionPlanPublicListResponseDto {
  @ApiProperty({ type: [SubscriptionPlanPublicResponseDto] })
  items: SubscriptionPlanPublicResponseDto[];
}

export class MeSubscriptionResponseDto {
  @ApiProperty({
    description:
      'True when the user currently has an active paid plan (status=active, endsAt in the future). Free-tier users will see `active=false` here even though they can still use general chat.',
  })
  active: boolean;

  @ApiProperty({ enum: SubscriptionStatus, nullable: true })
  status: SubscriptionStatus | null;

  @ApiProperty({ enum: SubscriptionInterval, nullable: true })
  interval: SubscriptionInterval | null;

  @ApiProperty({ nullable: true })
  planId: string | null;

  @ApiProperty({ nullable: true })
  planName: string | null;

  @ApiProperty({ nullable: true })
  priceDisplay: string | null;

  @ApiProperty({ nullable: true, description: 'ISO 8601' })
  startsAt: string | null;

  @ApiProperty({ nullable: true, description: 'ISO 8601' })
  endsAt: string | null;

  @ApiProperty({ nullable: true, description: 'ISO 8601' })
  paidAt: string | null;
}

export class BillingPersonalTrialDto {
  @ApiProperty()
  enabled: boolean;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  used: number;

  @ApiProperty()
  remaining: number;

  @ApiProperty()
  exhausted: boolean;
}

export class BillingAssistantAccessDto {
  @ApiProperty()
  active: boolean;

  @ApiProperty({ nullable: true, enum: AssistantAccessStatus })
  status: AssistantAccessStatus | null;

  @ApiProperty({ nullable: true })
  planName: string | null;

  @ApiProperty({ nullable: true })
  priceDisplay: string | null;

  @ApiProperty({ nullable: true, description: 'ISO 8601' })
  startsAt: string | null;

  @ApiProperty({ nullable: true, description: 'ISO 8601' })
  endsAt: string | null;

  @ApiProperty({ nullable: true, description: 'ISO 8601' })
  paidAt: string | null;
}

export class BillingConsultationSummaryDto {
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

  @ApiProperty({ nullable: true, description: 'ISO 8601' })
  paidAt: string | null;

  @ApiProperty({
    nullable: true,
    description:
      'UTC ISO-8601 start of the appointment (when the patient picked a slot).',
  })
  startsAt: string | null;

  @ApiProperty({
    nullable: true,
    description:
      'UTC ISO-8601 end of the appointment (start + duration). Null for unscheduled bookings.',
  })
  endsAt: string | null;

  @ApiProperty({
    nullable: true,
    description:
      'Phase 4 — meeting link the doctor attached. Surfaced only once the booking is `approved` (or further); always null for `pending_payment` / `pending_doctor_approval` bookings.',
  })
  meetingLink: string | null;

  @ApiProperty({ nullable: true, description: 'ISO 8601' })
  meetingLinkSetAt: string | null;

  @ApiProperty({ description: 'ISO 8601' })
  createdAt: string;
}

export class MeBillingResponseDto {
  @ApiProperty({ type: BillingAssistantAccessDto })
  assistantAccess: BillingAssistantAccessDto;

  @ApiProperty({ type: BillingPersonalTrialDto })
  personalTrial: BillingPersonalTrialDto;

  @ApiProperty({
    description:
      'True when the user may open personal chat and send messages (paid or trial remaining).',
  })
  personalChatAllowed: boolean;

  @ApiProperty({
    description:
      'True when trial is exhausted and no paid pass — history is read-only.',
  })
  personalChatReadOnly: boolean;

  @ApiProperty({ type: [BillingConsultationSummaryDto] })
  recentConsultations: BillingConsultationSummaryDto[];
}
