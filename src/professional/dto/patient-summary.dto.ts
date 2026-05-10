import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PatientSummaryDto {
  @ApiProperty({ description: 'Patient User.id (UUID)' })
  id: string;

  @ApiProperty()
  preferredName: string;

  @ApiProperty()
  email: string;

  @ApiProperty({
    description:
      'Numeric age in years, expressed as string for parity with DashboardProfile',
  })
  age: string;

  @ApiProperty({ enum: ['male', 'female', 'other'] })
  sexAtBirth: 'male' | 'female' | 'other';

  @ApiPropertyOptional()
  region?: string;

  @ApiProperty({
    description: 'True if the patient has saved any medical history',
  })
  hasMedicalHistory: boolean;

  @ApiProperty({ description: 'Onboarding completion timestamp (ISO 8601)' })
  registeredAt: string;

  @ApiProperty({
    description:
      'Latest doctor↔patient activity (last message or thread updatedAt)',
    nullable: true,
  })
  lastActivityAt: string | null;
}

export class ListPatientsResponseDto {
  @ApiProperty({ type: [PatientSummaryDto] })
  items: PatientSummaryDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;

  @ApiProperty()
  total: number;
}
