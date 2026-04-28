import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ConsultationFeesInputDto {
  @ApiProperty({ description: 'USD whole dollars' })
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  video!: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  written!: number;
}

export class TopDoctorEducationInputDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  degree!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  year!: string;
}

export class TopDoctorExperienceItemInputDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  subtitle!: string;
}

export class CreateTopDoctorBodyDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  role!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  specialty!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  subSpecialty!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  @Max(80)
  yearsOfExperience!: number;

  @ApiProperty({ type: () => ConsultationFeesInputDto })
  @ValidateNested()
  @Type(() => ConsultationFeesInputDto)
  consultationFees!: ConsultationFeesInputDto;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  /** Path or full URL; static assets are often served by the SPA until CDN. */
  heroImageUrl!: string;

  @ApiProperty({ type: () => TopDoctorEducationInputDto })
  @ValidateNested()
  @Type(() => TopDoctorEducationInputDto)
  education!: TopDoctorEducationInputDto;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  biography!: string[];

  @ApiProperty({ type: [TopDoctorExperienceItemInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TopDoctorExperienceItemInputDto)
  experience!: TopDoctorExperienceItemInputDto[];

  @ApiProperty({ type: [TopDoctorExperienceItemInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TopDoctorExperienceItemInputDto)
  affiliations!: TopDoctorExperienceItemInputDto[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  diseases!: string[];

  @ApiProperty()
  @IsString()
  @MinLength(0)
  publicationsSummary!: string;

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

export class PatchTopDoctorBodyDto extends PartialType(CreateTopDoctorBodyDto) {}
