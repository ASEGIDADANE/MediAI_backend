import { ApiProperty } from '@nestjs/swagger';

export class UserRoleOptionDto {
  @ApiProperty({ enum: ['personal', 'professional'] })
  id: string;
  @ApiProperty()
  title: string;
  @ApiProperty()
  description: string;
}

export class MeasurementSystemOptionDto {
  @ApiProperty({ enum: ['imperial', 'metric'] })
  id: string;
  @ApiProperty()
  title: string;
}

export class SexOptionDto {
  @ApiProperty({ enum: ['male', 'female', 'other'] })
  id: string;
  @ApiProperty()
  title: string;
}

export class FeatureOptionDto {
  @ApiProperty({ enum: ['ai-doctor', 'lab-test-interpretation', 'top-doctors'] })
  id: string;
  @ApiProperty()
  title: string;
  @ApiProperty()
  description: string;
}

export class ProfessionalTitleOptionDto {
  @ApiProperty()
  id: string;
  @ApiProperty()
  label: string;
}

export class OnboardingConfigResponseDto {
  @ApiProperty({ type: [UserRoleOptionDto] })
  userRoleOptions: UserRoleOptionDto[];

  @ApiProperty({ type: [String] })
  ethiopianRegions: string[];

  @ApiProperty({ type: [String] })
  onboardingStepLabels: string[];

  @ApiProperty({ type: [MeasurementSystemOptionDto] })
  measurementSystemOptions: MeasurementSystemOptionDto[];

  @ApiProperty({ type: [SexOptionDto] })
  sexOptions: SexOptionDto[];

  @ApiProperty({ type: [FeatureOptionDto] })
  featureOptions: FeatureOptionDto[];

  @ApiProperty({ type: [String] })
  generalInformationSteps: string[];

  @ApiProperty({ type: [ProfessionalTitleOptionDto] })
  professionalTitleOptions: ProfessionalTitleOptionDto[];

  @ApiProperty({ type: [String] })
  professionalSpecialtyOptions: string[];

  @ApiProperty({ type: [String] })
  professionalCompletionItems: string[];

  @ApiProperty({ type: [String] })
  smokingIntensityOptions: string[];

  @ApiProperty({ type: [String] })
  alcoholIntakeOptions: string[];

  @ApiProperty({ type: [String] })
  physicalActivityOptions: string[];

  @ApiProperty({ type: [String] })
  dietaryHabitOptions: string[];

  @ApiProperty({ type: [String] })
  sleepPatternOptions: string[];

  @ApiProperty({ type: [String] })
  stressLevelOptions: string[];
}
