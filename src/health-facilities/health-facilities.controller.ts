import { Controller, Get, Param, Query } from '@nestjs/common';
import { ParseHealthFacilityIdPipe } from './parse-health-facility-id.pipe';
import { Throttle } from '@nestjs/throttler';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { HealthFacilitiesQueryDto } from './dto/health-facilities-query.dto';
import {
  HealthFacilitiesListResponseDto,
  HealthcareFacilityDto,
} from './dto/health-facility-response.dto';
import { HealthFacilitiesService } from './health-facilities.service';

@ApiTags('health-facilities')
@Controller('health-facilities')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class HealthFacilitiesController {
  constructor(private readonly healthFacilities: HealthFacilitiesService) {}

  @Get()
  @ApiOperation({
    summary: 'List published healthcare facilities (hospital, pharmacy, clinic)',
    description:
      'Matches MediAI dashboard facility locator. Optional `q` searches name and address (max 120 chars).',
  })
  @ApiResponse({ status: 200, type: HealthFacilitiesListResponseDto })
  list(
    @Query() q: HealthFacilitiesQueryDto,
  ): Promise<HealthFacilitiesListResponseDto> {
    return this.healthFacilities.listPublic(q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one published facility by id (e.g. fac-001)' })
  @ApiParam({
    name: 'id',
    description: 'Stable id from list (e.g. fac-001); must match `fac-` + letters, digits, or hyphens, max 64 chars',
  })
  @ApiResponse({ status: 200, type: HealthcareFacilityDto })
  @ApiResponse({
    status: 400,
    description: 'Invalid id (empty, too long, or wrong format)',
  })
  @ApiResponse({ status: 404, description: 'Not found or unpublished' })
  getOne(
    @Param('id', ParseHealthFacilityIdPipe) id: string,
  ): Promise<HealthcareFacilityDto> {
    return this.healthFacilities.getPublicById(id);
  }
}
