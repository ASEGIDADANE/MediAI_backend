import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { ConsultationType } from '../../generated/prisma/client';

export class DoctorCapacityDto {
  @ApiProperty({
    nullable: true,
    description:
      'Hard upper bound on bookings per calendar day. `null` means no cap.',
  })
  maxAppointmentsPerDay!: number | null;

  @ApiProperty({
    enum: ConsultationType,
    description:
      'Pre-selected consultation type a patient sees when first opening the booking form for this doctor.',
  })
  defaultConsultationType!: ConsultationType;

  @ApiProperty({
    isArray: true,
    enum: ConsultationType,
    description:
      'Consultation methods the doctor accepts. Empty array = accept every type (i.e. the doctor has not yet opted in to specific types).',
  })
  acceptedConsultationTypes!: ConsultationType[];
}

export class PutDoctorCapacityDto {
  @ApiProperty({
    required: false,
    nullable: true,
    minimum: 1,
    maximum: 100,
    description:
      'Cap on bookings per day. Send `null` or omit to remove the cap.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxAppointmentsPerDay?: number | null;

  @ApiProperty({ enum: ConsultationType, required: false })
  @IsOptional()
  @IsEnum(ConsultationType)
  defaultConsultationType?: ConsultationType;

  @ApiProperty({
    required: false,
    isArray: true,
    enum: ConsultationType,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsEnum(ConsultationType, { each: true })
  acceptedConsultationTypes?: ConsultationType[];
}
