import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class DashboardProfileViewDto {
  @ApiProperty()
  preferredName: string;

  @ApiProperty()
  age: string;

  @ApiProperty()
  region: string;

  @ApiProperty({ enum: ['imperial', 'metric'] })
  measurementSystem: 'imperial' | 'metric';

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
}

export class PatientDetailDto {
  @ApiProperty({ description: 'Patient User.id (UUID)' })
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ type: DashboardProfileViewDto })
  profile: DashboardProfileViewDto;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Medical history JSON (matches MediAI MedicalHistoryData)',
  })
  medicalHistory: Record<string, unknown> | null;

  @ApiProperty()
  registeredAt: string;

  /**
   * ISO timestamp of the last write to the patient's UserProfile (any field —
   * profile, medical history, AI Doctor setup flag). Lets the frontend show
   * "Updated: …" without storing a separate per-section timestamp.
   */
  @ApiProperty()
  lastUpdatedAt: string;
}
