import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import {
  ConsultationBookingStatus,
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

  @ApiProperty({ description: 'ISO 8601' })
  createdAt: string;

  @ApiProperty({ description: 'ISO 8601' })
  updatedAt: string;
}

export class ConsultationBookingListResponseDto {
  @ApiProperty({ type: [ConsultationBookingResponseDto] })
  items: ConsultationBookingResponseDto[];
}
