import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  Equals,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ETHIOPIAN_REGIONS_LIST } from '../onboarding.constants';

const FEATURES = ['ai-doctor', 'top-doctors'] as const;

export class CompleteOnboardingDto {
  @ApiProperty({ enum: ['personal', 'professional'] })
  @IsIn(['personal', 'professional'])
  role: 'personal' | 'professional';

  @ApiProperty({ example: 'Alex' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  preferredName: string;

  @ApiProperty({
    description: 'Must be true — matches the MediAI onboarding checkbox.',
  })
  @Equals(true, { message: 'You must confirm you are 18+ or legal guardian' })
  confirmedAdult: boolean;

  @ApiProperty({ example: 'Addis Ababa' })
  @IsString()
  @IsIn(ETHIOPIAN_REGIONS_LIST)
  region: string;

  @ApiProperty({ example: 48, minimum: 1, maximum: 130 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(130)
  age: number;

  @ApiProperty({ enum: ['imperial', 'metric'] })
  @IsIn(['imperial', 'metric'])
  measurementSystem: 'imperial' | 'metric';

  @ApiProperty({
    description: 'Numeric string as in the wizard (e.g. "155" lb or "70" kg).',
    example: '70',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  weight: string;

  @ApiProperty({
    required: false,
    description: 'Required when measurementSystem is imperial',
  })
  @ValidateIf((o: CompleteOnboardingDto) => o.measurementSystem === 'imperial')
  @IsString()
  @IsNotEmpty()
  heightFeet?: string;

  @ApiProperty({
    required: false,
    description: 'Required when measurementSystem is imperial',
  })
  @ValidateIf((o: CompleteOnboardingDto) => o.measurementSystem === 'imperial')
  @IsString()
  @IsNotEmpty()
  heightInches?: string;

  @ApiProperty({
    required: false,
    description: 'Required when measurementSystem is metric',
  })
  @ValidateIf((o: CompleteOnboardingDto) => o.measurementSystem === 'metric')
  @IsString()
  @IsNotEmpty()
  heightCm?: string;

  @ApiProperty({ enum: ['male', 'female', 'other'] })
  @IsIn(['male', 'female', 'other'])
  sexAtBirth: 'male' | 'female' | 'other';

  @ApiProperty({ enum: [...FEATURES] })
  @IsIn([...FEATURES])
  preferredFeature: (typeof FEATURES)[number];
}
