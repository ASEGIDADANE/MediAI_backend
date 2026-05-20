import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AvailabilityService } from './availability.service';
import {
  AvailabilitySlotsListDto,
  SlotsQueryDto,
} from './dto/availability-slot.dto';

/**
 * Public-ish endpoint a patient hits when browsing a doctor's open slots.
 * It's still behind JWT auth (so we can rate-limit per user and avoid
 * scraping), but it returns purely public scheduling data (no PHI).
 */
@ApiTags('doctors-availability')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('doctors')
export class DoctorsAvailabilityController {
  constructor(private readonly svc: AvailabilityService) {}

  @Get(':doctorUserId/availability/slots')
  @ApiOperation({
    summary: 'Compute the next N days of bookable slots for a given doctor',
    description:
      "Walks the doctor's weekly rules forward `days` days (default 14, max 60), subtracts blocked dates and active bookings, applies the doctor's daily cap, and returns the remaining slots as UTC ISO-8601 ranges. Frontend renders them in the patient's local timezone.",
  })
  @ApiParam({ name: 'doctorUserId', description: 'Doctor User.id' })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'UTC start of the window. Defaults to "now".',
  })
  @ApiQuery({
    name: 'days',
    required: false,
    description: 'Number of days to compute. 1–60, default 14.',
  })
  @ApiResponse({ status: 200, type: AvailabilitySlotsListDto })
  @ApiResponse({ status: 404, description: 'Doctor not found' })
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  listSlots(
    @Param('doctorUserId') doctorUserId: string,
    @Query() query: SlotsQueryDto,
  ): Promise<AvailabilitySlotsListDto> {
    return this.svc.computeSlots(doctorUserId, query.from, query.days);
  }
}
