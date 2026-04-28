import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EducationResourceResponseDto {
  @ApiProperty({ enum: ['symptom-guide', 'glossary', 'knowledge-base'] })
  slug!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ type: [String] })
  bullets!: string[];

  @ApiPropertyOptional({
    enum: ['symptom-guide', 'glossary', 'knowledge-base'],
    description: 'Matches MediAI `resource-page` iconMap keys',
  })
  iconKey?: string;
}

export class EducationResourcesListResponseDto {
  @ApiProperty({ type: [EducationResourceResponseDto] })
  items!: EducationResourceResponseDto[];
}
