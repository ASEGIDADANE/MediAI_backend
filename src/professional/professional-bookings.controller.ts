import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { ProfessionalBookingsService } from './professional-bookings.service';
import {
  ApproveBookingDto,
  CancelByDoctorDto,
  ProfessionalBookingDto,
  ProfessionalBookingListDto,
  RejectBookingDto,
  SetMeetingLinkDto,
} from './dto/professional-booking.dto';

@ApiTags('professional-bookings')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('professional')
export class ProfessionalBookingsController {
  constructor(private readonly svc: ProfessionalBookingsService) {}

  @Get('booking-requests')
  @ApiOperation({
    summary:
      "List bookings awaiting the calling doctor's decision (status = pending_doctor_approval)",
    description:
      "Patient must have completed payment for a booking to appear here — `pending_payment` bookings are deliberately invisible to doctors so the doctor's inbox stays spam-free.",
  })
  @ApiResponse({ status: 200, type: ProfessionalBookingListDto })
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  listRequests(
    @CurrentUser() user: RequestUser,
  ): Promise<ProfessionalBookingListDto> {
    return this.svc.listBookingRequests(user.id);
  }

  @Get('appointments')
  @ApiOperation({
    summary:
      "List the calling doctor's already-decided appointments (approved/completed/missed)",
  })
  @ApiResponse({ status: 200, type: ProfessionalBookingListDto })
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  listAppointments(
    @CurrentUser() user: RequestUser,
  ): Promise<ProfessionalBookingListDto> {
    return this.svc.listAppointments(user.id);
  }

  @Post('bookings/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve a pending booking request',
    description:
      'Transitions `pending_doctor_approval → approved`, unlocking the chat thread for the patient and surfacing the booking on `/professional/appointments`. Optionally attach a `meetingLink` so the patient sees it immediately on approval.',
  })
  @ApiParam({ name: 'id', description: 'ConsultationBooking.id' })
  @ApiResponse({ status: 200, type: ProfessionalBookingDto })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  @ApiResponse({
    status: 409,
    description: 'Booking is not in a state that can be approved',
  })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  approve(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ApproveBookingDto = {},
  ): Promise<ProfessionalBookingDto> {
    return this.svc.approve(user.id, id, { meetingLink: body.meetingLink });
  }

  /**
   * Frontend uses "Confirm appointment" terminology on the booking-requests
   * page. This alias delegates to `approve()` so the existing axios call
   * (`POST /professional/booking-requests/:id/confirm`) keeps working. The
   * Phase 4 `meetingLink` body field flows through unchanged.
   */
  @Post('booking-requests/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Alias for `/professional/bookings/:id/approve` (legacy frontend path)',
  })
  @ApiResponse({ status: 200, type: ProfessionalBookingDto })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  confirm(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: ApproveBookingDto = {},
  ): Promise<ProfessionalBookingDto> {
    return this.svc.approve(user.id, id, { meetingLink: body.meetingLink });
  }

  @Patch('bookings/:id/meeting-link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set or clear the meeting link on an already-approved booking',
    description:
      'Phase 4. Only available once the booking is `approved` (or `completed` / legacy `confirmed`). Pass an empty string to clear the link.',
  })
  @ApiResponse({ status: 200, type: ProfessionalBookingDto })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  @ApiResponse({
    status: 409,
    description: 'Booking is not in a state where a meeting link is meaningful',
  })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  setMeetingLink(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: SetMeetingLinkDto,
  ): Promise<ProfessionalBookingDto> {
    return this.svc.setMeetingLink(user.id, id, body.meetingLink);
  }

  @Post('bookings/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject a pending booking request (reason required)',
    description:
      'Transitions `pending_doctor_approval → rejected` with the supplied reason, and moves `refund_status` to `pending` so finance can issue a refund.',
  })
  @ApiResponse({ status: 200, type: ProfessionalBookingDto })
  @ApiResponse({ status: 400, description: 'Reason is required' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  @ApiResponse({
    status: 409,
    description: 'Booking is not in a state that can be rejected',
  })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  reject(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: RejectBookingDto,
  ): Promise<ProfessionalBookingDto> {
    return this.svc.reject(user.id, id, body.reason);
  }

  @Post('bookings/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Doctor-side cancel of an already-approved booking',
    description:
      'Transitions `approved → cancelled` (or legacy `confirmed → cancelled`) and moves `refund_status` to `pending`.',
  })
  @ApiResponse({ status: 200, type: ProfessionalBookingDto })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  @ApiResponse({
    status: 409,
    description: 'Booking is not in a state that can be cancelled',
  })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  cancel(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: CancelByDoctorDto,
  ): Promise<ProfessionalBookingDto> {
    return this.svc.cancel(user.id, id, body.reason);
  }

  @Post('bookings/:id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark an approved booking as completed (post-consultation)',
  })
  @ApiResponse({ status: 200, type: ProfessionalBookingDto })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  complete(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ProfessionalBookingDto> {
    return this.svc.markCompleted(user.id, id);
  }

  @Post('bookings/:id/mark-missed')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark an approved booking as missed (no-show)',
  })
  @ApiResponse({ status: 200, type: ProfessionalBookingDto })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  markMissed(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ProfessionalBookingDto> {
    return this.svc.markMissed(user.id, id);
  }
}
