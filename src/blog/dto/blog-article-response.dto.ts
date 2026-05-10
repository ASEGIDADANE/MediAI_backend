import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BlogSectionDto {
  @ApiProperty()
  title!: string;

  @ApiProperty()
  body!: string;
}

/** Matches MediAI `src/lib/blog-api.ts` `BlogArticleDto`. */
export class BlogArticleResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  category!: string;

  @ApiProperty()
  author!: string;

  @ApiProperty({ example: 'Jan 07, 2025' })
  date!: string;

  @ApiProperty({ example: '12 min Read' })
  readTime!: string;

  @ApiProperty()
  imageSrc!: string;

  @ApiProperty()
  intro!: string;

  @ApiProperty({ type: [BlogSectionDto] })
  sections!: BlogSectionDto[];
}

export class BlogArticlesListResponseDto {
  @ApiProperty({ type: [BlogArticleResponseDto] })
  items!: BlogArticleResponseDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;

  @ApiProperty()
  total!: number;
}

/** Admin article row: public shape + curation fields (MediAI `BlogArticleAdminDto`). */
export class BlogArticleAdminResponseDto extends BlogArticleResponseDto {
  @ApiProperty()
  published!: boolean;

  @ApiProperty({ example: '2025-01-07T12:00:00.000Z' })
  publishedAt!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Raw display override (maps to public `date`)',
  })
  dateDisplay!: string | null;

  @ApiPropertyOptional({ nullable: true })
  sortOrder!: number | null;
}

export class BlogArticlesAdminListResponseDto {
  @ApiProperty({ type: [BlogArticleAdminResponseDto] })
  items!: BlogArticleAdminResponseDto[];

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;

  @ApiProperty()
  total!: number;
}

export class BlogCategoriesResponseDto {
  @ApiProperty({ type: [String] })
  categories!: string[];
}

export class BlogHomeResponseDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  featuredArticleId!: string | null;

  @ApiProperty({ type: [String] })
  popularArticleIds!: string[];

  @ApiProperty({ type: [String] })
  aiHealthcareArticleIds!: string[];

  @ApiProperty({ type: [String] })
  secondOpinionArticleIds!: string[];

  @ApiProperty({ type: [String] })
  companyNewsArticleIds!: string[];
}
