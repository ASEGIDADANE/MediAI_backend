import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/**
 * Body payload for `POST /api/admin/subscription-plans`. Prices are sent as
 * **minor units** (cents) so we avoid floating-point currency drift. The API
 * returns a pre-formatted display string for read paths.
 */
export class CreateSubscriptionPlanBodyDto {
  @ApiProperty({ example: 'Pro', minLength: 1, maxLength: 60 })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiProperty({ example: 799, minimum: 0, maximum: 100_000_00 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_00)
  monthlyPriceCents!: number;

  @ApiProperty({ example: 9588, minimum: 0, maximum: 100_000_00 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_00)
  yearlyPriceCents!: number;

  @ApiPropertyOptional({
    example: 'USD',
    default: 'USD',
    description: 'ISO-4217 3-letter currency code (uppercased server-side).',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/)
  currency?: string;

  @ApiPropertyOptional({ type: [String], default: [] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  features?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ default: 0, minimum: 0, maximum: 1_000_000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  sortOrder?: number;
}

export class PatchSubscriptionPlanBodyDto extends PartialType(
  CreateSubscriptionPlanBodyDto,
) {}
