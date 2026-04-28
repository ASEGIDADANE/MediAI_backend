import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';

const MAX_ARR = 200;
const MAX_STR = 16_000;
const MAX_ITEM = 200;

/**
 * `MedicalHistoryData` from MediAI `dashboard-content` — all fields present for PUT
 * (replace body); use empty strings / [] where not applicable.
 */
export class MedicalHistoryDataDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(MAX_ARR)
  @MaxLength(MAX_ITEM, { each: true })
  chronicDiseases: string[];

  @ApiProperty()
  @IsString()
  @MaxLength(MAX_STR)
  chronicDetails: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(MAX_ARR)
  @MaxLength(MAX_ITEM, { each: true })
  allergies: string[];

  @ApiProperty()
  @IsString()
  @MaxLength(MAX_STR)
  allergyDetails: string;

  @ApiProperty()
  @IsString()
  @MaxLength(MAX_STR)
  currentMedications: string;

  @ApiProperty()
  @IsString()
  @MaxLength(MAX_STR)
  pastMedications: string;

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  smokingIntensity: string;

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  alcoholIntake: string;

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  dietaryHabits: string;

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  activityLevel: string;

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  sleepPattern: string;

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  stressLevel: string;
}
