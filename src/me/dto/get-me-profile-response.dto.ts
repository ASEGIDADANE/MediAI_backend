import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
}

export class GetMeProfileResponseDto {
  @ApiProperty({ type: DashboardProfileViewDto, nullable: true })
  profile: DashboardProfileViewDto | null;

  @ApiProperty({ type: 'object', nullable: true, additionalProperties: true })
  medicalHistory: Record<string, unknown> | null;

  @ApiProperty()
  aiDoctorSetupCompleted: boolean;
}
