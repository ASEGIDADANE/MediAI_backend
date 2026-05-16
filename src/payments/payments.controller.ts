import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { PaymentsService } from './payments.service';
import {
  AssistantAccessPlanListResponseDto,
  InitiateAssistantPaymentBodyDto,
  InitiateChapaPaymentResponseDto,
  MeBillingResponseDto,
} from './dto/payments.dto';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('assistant/plans')
  @ApiOperation({
    summary: 'Public assistant access plans for the pricing page',
  })
  @ApiResponse({ status: 200, type: AssistantAccessPlanListResponseDto })
  listAssistantPlans(): Promise<AssistantAccessPlanListResponseDto> {
    return this.payments.listAssistantPlans();
  }

  @Post('assistant/initiate')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('access-token')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Start a Chapa checkout for personalized assistant access',
  })
  @ApiResponse({ status: 200, type: InitiateChapaPaymentResponseDto })
  initiateAssistant(
    @CurrentUser() user: RequestUser,
    @Body() body: InitiateAssistantPaymentBodyDto,
  ): Promise<InitiateChapaPaymentResponseDto> {
    return this.payments.initiateAssistantPayment(user.id, body.planId);
  }

  @Post('consultations/:bookingId/initiate')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('access-token')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Start a Chapa checkout for an existing consultation booking',
  })
  @ApiResponse({ status: 200, type: InitiateChapaPaymentResponseDto })
  initiateConsultation(
    @CurrentUser() user: RequestUser,
    @Param('bookingId', new ParseUUIDPipe()) bookingId: string,
  ): Promise<InitiateChapaPaymentResponseDto> {
    return this.payments.initiateConsultationPayment(user.id, bookingId);
  }

  @Get('chapa/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Chapa transaction callback (GET)',
    description:
      'Verifies the transaction server-side. Used as a fallback to webhooks; frontend return pages must not grant value directly.',
  })
  @ApiQuery({ name: 'trx_ref', required: false })
  @ApiQuery({ name: 'tx_ref', required: false })
  @ApiQuery({ name: 'ref_id', required: false })
  @ApiQuery({ name: 'status', required: false })
  async chapaCallback(
    @Query('trx_ref') trxRef: string | undefined,
    @Query('tx_ref') txRef: string | undefined,
    @Query('ref_id') refId: string | undefined,
    @Query('status') status: string | undefined,
  ): Promise<{ ok: true }> {
    return this.payments.handleChapaCallback({
      trxRef,
      txRef,
      refId,
      status,
    });
  }
}

@ApiTags('me')
@Controller('me')
export class MeBillingController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('billing')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Billing snapshot for the current user',
  })
  @ApiResponse({ status: 200, type: MeBillingResponseDto })
  getBilling(@CurrentUser() user: RequestUser): Promise<MeBillingResponseDto> {
    return this.payments.getMyBilling(user.id);
  }
}
