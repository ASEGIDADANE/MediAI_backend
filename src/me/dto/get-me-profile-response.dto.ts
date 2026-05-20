import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class DoctorVerificationSnapshotDto {
  @ApiProperty({ enum: ['pending', 'verified', 'rejected'] })
  status: 'pending' | 'verified' | 'rejected';

  @ApiProperty({ nullable: true, description: 'ISO 8601' })
  submittedAt: string | null;

  @ApiProperty({ nullable: true, description: 'ISO 8601' })
  reviewedAt: string | null;

  @ApiProperty({ nullable: true })
  notes: string | null;
}

class DashboardProfileViewDto {
  @ApiProperty()
  preferredName: string;

  @ApiProperty()
  age: string;

  @ApiProperty()
  region: string;

  @ApiProperty({ enum: ['imperial', 'metric'] })
  measurementSystem: string;

  @ApiProperty()
  weight: string;

  @ApiProperty()
  heightFeet: string;

  @ApiProperty()
  heightInches: string;

  @ApiProperty()
  heightCm: string;

  @ApiProperty({ enum: ['male', 'female', 'other'] })
  sexAtBirth: 'male' | 'female' | 'other';

  @ApiProperty()
  preferredFeature: string;

  @ApiPropertyOptional()
  professionalProfile?: Record<string, unknown>;

  @ApiPropertyOptional({
    type: DoctorVerificationSnapshotDto,
    description:
      'Only present for `role=professional`. Drives the doctor verification gate on the dashboard.',
  })
  verification?: DoctorVerificationSnapshotDto;

  /**
   * Phase 5 — patient-selected condition categories used for smart matching
   * on `/top-doctors`. Empty array when the patient hasn't filled in the
   * picker yet; meaningless for professional accounts.
   */
  @ApiPropertyOptional({ type: [String] })
  primaryConditions?: string[];

  /**
   * Phase 5 — doctor's canonical specialty (enum string). Null when not yet
   * mapped; meaningless for personal accounts.
   */
  @ApiPropertyOptional({ nullable: true })
  medicalSpecialty?: string | null;
}

export class GetMeProfileResponseDto {
  @ApiProperty({ type: DashboardProfileViewDto, nullable: true })
  profile: DashboardProfileViewDto | null;

  @ApiProperty({ type: 'object', nullable: true, additionalProperties: true })
  medicalHistory: Record<string, unknown> | null;

  @ApiProperty()
  aiDoctorSetupCompleted: boolean;
}
