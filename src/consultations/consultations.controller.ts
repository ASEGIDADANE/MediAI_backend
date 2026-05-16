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
    summary: 'Fetch one consultation booking owned by the patient or visible to admins',
  })
  @ApiResponse({ status: 200, type: ConsultationBookingResponseDto })
  getOne(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ConsultationBookingResponseDto> {
    return this.consultations.getBookingById(user.id, user.appRole, id);
  }
}
