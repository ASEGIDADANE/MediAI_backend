import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import {
  AssistantAccessStatus,
  ConsultationBookingStatus,
  ConsultationType,
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

  @ApiProperty({ format: 'uri' })
  checkoutUrl: string;

  @ApiPropertyOptional({ format: 'uuid' })
  accessId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  bookingId?: string;
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

  @ApiProperty({ description: 'ISO 8601' })
  createdAt: string;
}

export class MeBillingResponseDto {
  @ApiProperty({ type: BillingAssistantAccessDto })
  assistantAccess: BillingAssistantAccessDto;

  @ApiProperty({ type: [BillingConsultationSummaryDto] })
  recentConsultations: BillingConsultationSummaryDto[];
}
