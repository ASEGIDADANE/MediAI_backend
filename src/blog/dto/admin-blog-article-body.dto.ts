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
import { BlogSectionInputDto } from './blog-section-input.dto';

export class CreateBlogArticleBodyDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  category!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  author!: string;

  @ApiProperty({ example: '12 min Read' })
  @IsString()
  @MinLength(1)
  readTime!: string;

  @ApiPropertyOptional({
    description:
      'Cover image URL. May be a relative `/path.png` from `public/`, an absolute https URL, or an empty string for no image.',
    default: '',
  })
  @IsOptional()
  @IsString()
  imageSrc?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  intro!: string;

  @ApiProperty({ type: [BlogSectionInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlogSectionInputDto)
  sections!: BlogSectionInputDto[];

  @ApiProperty({ description: 'ISO-8601 date-time for sorting' })
  @IsString()
  @MinLength(1)
  publishedAt!: string;

  @ApiPropertyOptional({
    description: 'Display string e.g. "Jan 07, 2025" (API `date` field)',
  })
  @IsOptional()
  @IsString()
  dateDisplay?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  sortOrder?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

export class PatchBlogArticleBodyDto extends PartialType(
  CreateBlogArticleBodyDto,
) {}

export class BlogHomeConfigBodyDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsString()
  featuredArticleId?: string | null;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  popularArticleIds!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  aiHealthcareArticleIds!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  secondOpinionArticleIds!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  companyNewsArticleIds!: string[];
}
