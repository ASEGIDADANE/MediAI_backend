import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const SLUGS = ['symptom-guide', 'glossary', 'knowledge-base'] as const;

export class CreateEducationResourceBodyDto {
  @ApiProperty({ enum: SLUGS })
  @IsString()
  @IsIn(SLUGS)
  slug!: (typeof SLUGS)[number];

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  description!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  bullets!: string[];

  @ApiPropertyOptional({ enum: SLUGS })
  @IsOptional()
  @IsString()
  @IsIn(SLUGS)
  iconKey?: (typeof SLUGS)[number];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  published?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class PatchEducationResourceBodyDto extends PartialType(
  OmitType(CreateEducationResourceBodyDto, ['sortOrder'] as const),
) {
  @ApiPropertyOptional({
    nullable: true,
    description: 'Omit to leave unchanged; send null to clear sort order in the database.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number | null;
}
