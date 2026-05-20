import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt.guard';
import { OptionalUser } from '../auth/decorators/optional-user.decorator';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import {
  ConditionMatchOptionsDto,
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

  @Get('match-options')
  @ApiOperation({
    summary:
      'Phase 5 — canonical condition categories + specialty labels for the smart-matching pickers',
    description:
      'Returns the master lists the frontend uses to build the patient condition multi-select and the doctor specialty dropdown. Safe to cache on the client; the lists only change when the backend ships a new release.',
  })
  @ApiResponse({ status: 200, type: ConditionMatchOptionsDto })
  getMatchOptions(): ConditionMatchOptionsDto {
    return this.topDoctors.getMatchOptions();
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'List published top doctors (paginated)',
    description:
      'Optional `q` searches `name`, `specialty`, `subSpecialty`, and `diseases` (JSON as text). Max 120 chars. Phase 5 — when a JWT is attached the response is enriched with `inRegion` / `matchesConditions` based on the patient profile.',
  })
  @ApiResponse({ status: 200, type: TopDoctorsListResponseDto })
  list(
    @Query() q: TopDoctorsQueryDto,
    @OptionalUser() user?: RequestUser,
  ): Promise<TopDoctorsListResponseDto> {
    return this.topDoctors.listPublic(q, user?.id ?? null);
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
