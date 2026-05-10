import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  TopDoctorDto,
  TopDoctorsListResponseDto,
  TopDoctorSpecialtiesResponseDto,
} from './dto/top-doctor-response.dto';
import { TopDoctorsQueryDto } from './dto/top-doctors-query.dto';
import { TopDoctorsService } from './top-doctors.service';

@ApiTags('top-doctors')
@Controller('top-doctors')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class TopDoctorsController {
  constructor(private readonly topDoctors: TopDoctorsService) {}

  @Get('specialties')
  @ApiOperation({ summary: 'Distinct specialties (published doctors only)' })
  @ApiResponse({ status: 200, type: TopDoctorSpecialtiesResponseDto })
  async getSpecialties(): Promise<TopDoctorSpecialtiesResponseDto> {
    const specialties = await this.topDoctors.listSpecialties();
    return { specialties };
  }

  @Get()
  @ApiOperation({
    summary: 'List published top doctors (paginated)',
    description:
      'Optional `q` searches `name`, `specialty`, `subSpecialty`, and `diseases` (JSON as text). Max 120 chars.',
  })
  @ApiResponse({ status: 200, type: TopDoctorsListResponseDto })
  list(@Query() q: TopDoctorsQueryDto): Promise<TopDoctorsListResponseDto> {
    return this.topDoctors.listPublic(q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one published top doctor by id' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: TopDoctorDto })
  @ApiResponse({ status: 404, description: 'Not found or unpublished' })
  getOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<TopDoctorDto> {
    return this.topDoctors.getPublicById(id);
  }
}
