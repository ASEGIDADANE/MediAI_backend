import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const SLUGS = ['symptom-guide', 'glossary', 'knowledge-base'] as const;

/** Admin + editor payloads: public fields plus identifiers and workflow metadata. */
export class EducationResourceAdminResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: SLUGS })
  slug!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ type: [String] })
  bullets!: string[];

  @ApiPropertyOptional({
    enum: SLUGS,
    description: 'Matches MediAI resource page icon keys',
  })
  iconKey?: string;

  @ApiProperty()
  published!: boolean;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Display order; null sorts last',
  })
  sortOrder!: number | null;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

export class EducationResourcesAdminListResponseDto {
  @ApiProperty({ type: [EducationResourceAdminResponseDto] })
  items!: EducationResourceAdminResponseDto[];
}
