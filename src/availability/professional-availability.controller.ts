import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { AvailabilityService } from './availability.service';
import {
  PutWeeklyAvailabilityDto,
  WeeklyAvailabilityListDto,
} from './dto/weekly-availability-rule.dto';
import {
  CreateUnavailableDateDto,
  UnavailableDateDto,
  UnavailableDateListDto,
} from './dto/unavailable-date.dto';
import {
  DoctorCapacityDto,
  PutDoctorCapacityDto,
} from './dto/doctor-capacity.dto';

@ApiTags('professional-availability')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('professional/availability')
export class ProfessionalAvailabilityController {
  constructor(private readonly svc: AvailabilityService) {}

  @Get()
  @ApiOperation({
    summary: "List the calling doctor's recurring weekly availability rules",
  })
  @ApiResponse({ status: 200, type: WeeklyAvailabilityListDto })
  @ApiResponse({
    status: 403,
    description: 'Caller is not a professional user',
  })
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  listMine(
    @CurrentUser() user: RequestUser,
  ): Promise<WeeklyAvailabilityListDto> {
    return this.svc.listMyRules(user.id);
  }

  @Put()
  @ApiOperation({
    summary:
      "Replace the calling doctor's weekly availability rules (full PUT semantics)",
    description:
      'Deletes any existing rules for the caller and inserts the submitted set as the new authoritative pattern. Rule ids on the input array are ignored — fresh ids are minted on insert.',
  })
  @ApiResponse({ status: 200, type: WeeklyAvailabilityListDto })
  @ApiResponse({ status: 400, description: 'Invalid rule shape' })
  @ApiResponse({
    status: 403,
    description: 'Caller is not a professional user',
  })
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  replaceMine(
    @CurrentUser() user: RequestUser,
    @Body() dto: PutWeeklyAvailabilityDto,
  ): Promise<WeeklyAvailabilityListDto> {
    return this.svc.replaceMyRules(user.id, dto);
  }

  @Get('unavailable-dates')
  @ApiOperation({
    summary: "List the calling doctor's blocked dates (vacations / sick days)",
  })
  @ApiResponse({ status: 200, type: UnavailableDateListDto })
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  listUnavailable(
    @CurrentUser() user: RequestUser,
  ): Promise<UnavailableDateListDto> {
    return this.svc.listMyUnavailableDates(user.id);
  }

  @Post('unavailable-dates')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Block a single calendar date' })
  @ApiResponse({ status: 201, type: UnavailableDateDto })
  @ApiResponse({
    status: 400,
    description: 'Invalid date or date already blocked',
  })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  createUnavailable(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateUnavailableDateDto,
  ): Promise<UnavailableDateDto> {
    return this.svc.createUnavailableDate(user.id, dto);
  }

  @Delete('unavailable-dates/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a previously blocked calendar date' })
  @ApiParam({ name: 'id', description: 'DoctorUnavailableDate.id' })
  @ApiResponse({ status: 204, description: 'Removed' })
  @ApiResponse({ status: 404, description: 'Not found' })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async deleteUnavailable(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.svc.deleteUnavailableDate(user.id, id);
  }

  @Get('capacity')
  @ApiOperation({
    summary:
      "Read the calling doctor's capacity & consultation-type preferences",
  })
  @ApiResponse({ status: 200, type: DoctorCapacityDto })
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  getCapacity(@CurrentUser() user: RequestUser): Promise<DoctorCapacityDto> {
    return this.svc.getMyCapacity(user.id);
  }

  @Put('capacity')
  @ApiOperation({
    summary:
      "Patch the calling doctor's capacity & consultation-type preferences",
  })
  @ApiResponse({ status: 200, type: DoctorCapacityDto })
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  putCapacity(
    @CurrentUser() user: RequestUser,
    @Body() dto: PutDoctorCapacityDto,
  ): Promise<DoctorCapacityDto> {
    return this.svc.putMyCapacity(user.id, dto);
  }
}
