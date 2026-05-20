import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { ConsultationsService } from './consultations.service';
import {
  CancelConsultationBookingDto,
  ConsultationBookingListResponseDto,
  ConsultationBookingResponseDto,
  CreateConsultationBookingDto,
} from './dto/consultations.dto';

@ApiTags('consultations')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('consultations')
export class ConsultationsController {
  constructor(private readonly consultations: ConsultationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Create a pending consultation booking for the current patient',
  })
  @ApiResponse({ status: 201, type: ConsultationBookingResponseDto })
  create(
    @CurrentUser() user: RequestUser,
    @Body() body: CreateConsultationBookingDto,
  ): Promise<ConsultationBookingResponseDto> {
    return this.consultations.createBooking(user.id, user.appRole, body);
  }

  @Get('my')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary: 'List the current patient’s consultation bookings',
  })
  @ApiResponse({ status: 200, type: ConsultationBookingListResponseDto })
  myBookings(
    @CurrentUser() user: RequestUser,
  ): Promise<ConsultationBookingListResponseDto> {
    return this.consultations.listMyBookings(user.id);
  }

  @Get(':id')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Fetch one consultation booking owned by the patient or visible to admins',
  })
  @ApiResponse({ status: 200, type: ConsultationBookingResponseDto })
  getOne(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ConsultationBookingResponseDto> {
    return this.consultations.getBookingById(user.id, user.appRole, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Patient-side cancel of a still-open booking',
    description:
      'Allowed while status ∈ {pending_payment, paid, pending_doctor_approval, approved (legacy: paid/confirmed)}. Sets `cancelled_at`, stamps `cancelled_by_user_id`, and moves a paid booking to `refund_status=pending` so the finance pipeline knows to issue a refund.',
  })
  @ApiResponse({ status: 200, type: ConsultationBookingResponseDto })
  @ApiResponse({ status: 404, description: 'Booking not found or not yours' })
  @ApiResponse({
    status: 409,
    description: 'Booking is already in a terminal state',
  })
  cancel(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CancelConsultationBookingDto,
  ): Promise<ConsultationBookingResponseDto> {
    return this.consultations.cancelMyBooking(user.id, id, body);
  }
}
