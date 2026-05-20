import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AvailabilitySlotDto {
  @ApiProperty({
    description: 'UTC ISO8601 start of the bookable slot.',
    example: '2026-06-15T09:00:00.000Z',
  })
  startsAt!: string;

  @ApiProperty({
    description: 'UTC ISO8601 end of the bookable slot (exclusive).',
    example: '2026-06-15T09:30:00.000Z',
  })
  endsAt!: string;
}

export class AvailabilitySlotsListDto {
  @ApiProperty({ type: () => [AvailabilitySlotDto] })
  items!: AvailabilitySlotDto[];
}

export class SlotsQueryDto {
  @ApiProperty({
    required: false,
    description:
      'UTC ISO8601 timestamp the window starts at. Defaults to "now" if omitted.',
    example: '2026-06-15T00:00:00.000Z',
  })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiProperty({
    required: false,
    minimum: 1,
    maximum: 60,
    description: 'How many days of slots to compute. Defaults to 14.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  days?: number;
}
