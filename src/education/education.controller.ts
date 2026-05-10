import { Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  EducationResourceResponseDto,
  EducationResourcesListResponseDto,
} from './dto/education-resource-response.dto';
import { EducationService } from './education.service';

@ApiTags('education')
@Controller('education/resources')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class EducationController {
  constructor(private readonly education: EducationService) {}

  @Get()
  @ApiOperation({
    summary: 'List published help / education pages (MediAI resource pages)',
  })
  @ApiResponse({ status: 200, type: EducationResourcesListResponseDto })
  list(): Promise<EducationResourcesListResponseDto> {
    return this.education.listPublic();
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get one resource by slug' })
  @ApiParam({
    name: 'slug',
    enum: ['symptom-guide', 'glossary', 'knowledge-base'],
  })
  @ApiResponse({ status: 200, type: EducationResourceResponseDto })
  @ApiResponse({ status: 404, description: 'Unknown slug or unpublished' })
  getOne(@Param('slug') slug: string): Promise<EducationResourceResponseDto> {
    return this.education.getPublicBySlug(slug);
  }
}
