import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DashboardAlignedProfileDto {
  @ApiProperty({ enum: ['personal', 'professional'] })
  role: string;

  @ApiProperty()
  preferredName: string;

  @ApiProperty()
  confirmedAdult: boolean;

  @ApiProperty()
  region: string;

  @ApiProperty({ description: 'Age as string to match MediAI dashboard localStorage shape' })
  age: string;

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
  sexAtBirth: string;

  @ApiProperty({
    enum: ['ai-doctor', 'top-doctors'],
    description: 'Kebab-case IDs as used by the MediAI frontend',
  })
  preferredFeature: string;

  @ApiProperty({ format: 'date-time' })
  onboardingCompletedAt: string;
}

export class OnboardingStatusDto {
  @ApiProperty({ description: 'True when UserProfile exists for this user' })
  completed: boolean;

  @ApiPropertyOptional({
    type: DashboardAlignedProfileDto,
    description: 'Null until onboarding is completed at least once',
  })
  profile: DashboardAlignedProfileDto | null;
}
