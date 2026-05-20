import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class WeeklyAvailabilityRuleDto {
  @ApiProperty({
    required: false,
    description:
      'Existing rule id when echoing back; absent on POST/PUT input. Always set on output.',
  })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({
    description:
      '0=Sunday … 6=Saturday (matches JS `Date.getDay()` convention).',
    minimum: 0,
    maximum: 6,
  })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiProperty({
    description:
      'Inclusive start of the daily window, expressed as minutes since 00:00 in the rule timezone (e.g. 540 = 09:00).',
    minimum: 0,
    maximum: 24 * 60,
  })
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  startTimeMinutes!: number;

  @ApiProperty({
    description:
      'Exclusive end of the daily window. Must be greater than `startTimeMinutes`.',
    minimum: 1,
    maximum: 24 * 60,
  })
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  endTimeMinutes!: number;

  @ApiProperty({
    description:
      'Length of each generated slot, in minutes. Must divide the window length evenly; trailing partial slots are dropped.',
    minimum: 5,
    maximum: 8 * 60,
  })
  @IsInt()
  @Min(5)
  @Max(8 * 60)
  slotDurationMinutes!: number;

  @ApiProperty({
    description:
      'IANA timezone name. Used to interpret start/end-time-minutes and to apply daylight-saving transitions safely.',
    example: 'Africa/Addis_Ababa',
  })
  @IsString()
  timezone!: string;
}

export class PutWeeklyAvailabilityDto {
  @ApiProperty({
    type: () => [WeeklyAvailabilityRuleDto],
    description:
      'Full replacement set. Existing rules NOT present in this array are deleted; new entries are inserted; pre-existing ids that reappear are kept.',
  })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => WeeklyAvailabilityRuleDto)
  items!: WeeklyAvailabilityRuleDto[];
}

export class WeeklyAvailabilityListDto {
  @ApiProperty({ type: () => [WeeklyAvailabilityRuleDto] })
  items!: WeeklyAvailabilityRuleDto[];
}
