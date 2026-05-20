import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class UnavailableDateDto {
  @ApiProperty({ description: 'Server-generated id.' })
  id!: string;

  @ApiProperty({
    description: 'Local calendar date the doctor is fully unavailable.',
    example: '2026-06-15',
  })
  date!: string;

  @ApiProperty({
    nullable: true,
    description:
      'Internal-only reason (vacation, sick day, …). Never shown to patients.',
  })
  reason!: string | null;
}

export class CreateUnavailableDateDto {
  @ApiProperty({
    description: 'Calendar date to block, `YYYY-MM-DD`.',
    example: '2026-06-15',
  })
  @IsDateString()
  date!: string;

  @ApiProperty({
    required: false,
    description: 'Optional internal-only reason (max 280 chars).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  reason?: string;
}

export class UnavailableDateListDto {
  @ApiProperty({ type: () => [UnavailableDateDto] })
  items!: UnavailableDateDto[];
}
