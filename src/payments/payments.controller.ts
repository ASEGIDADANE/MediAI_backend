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
  InitiateSubscriptionPaymentBodyDto,
  MeBillingResponseDto,
  MeSubscriptionResponseDto,
  SubscriptionPlanPublicListResponseDto,
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

  // ---------------------------------------------------------------------------
  // Phase 7 — SubscriptionPlan flow (canonical; replaces the old assistant
  // 30/90-day pass UX on /pricing while keeping the assistant endpoints
  // alive as a transitional fallback).
  // ---------------------------------------------------------------------------

  @Get('subscription/plans')
  @ApiOperation({
    summary:
      'Public list of active SubscriptionPlans (Free / Lite / Pro) for the /pricing page.',
  })
  @ApiResponse({ status: 200, type: SubscriptionPlanPublicListResponseDto })
  listPublicSubscriptionPlans(): Promise<SubscriptionPlanPublicListResponseDto> {
    return this.payments.listPublicSubscriptionPlans();
  }

  @Post('subscription/initiate')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('access-token')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Start a Chapa checkout (or auto-grant Free) for a subscription plan.',
    description:
      'For paid plans returns `{ txRef, checkoutUrl, subscriptionId }` — redirect the browser to `checkoutUrl`. For the Free plan returns `{ txRef, freeGranted: true, subscriptionId }` and the active row is created immediately; no redirect needed.',
  })
  @ApiResponse({ status: 200, type: InitiateChapaPaymentResponseDto })
  initiateSubscription(
    @CurrentUser() user: RequestUser,
    @Body() body: InitiateSubscriptionPaymentBodyDto,
  ): Promise<InitiateChapaPaymentResponseDto> {
    return this.payments.initiateSubscriptionPayment(
      user.id,
      body.planId,
      body.interval,
    );
  }

  @Post('subscription/:subscriptionId/finalize')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('access-token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Verify a Chapa transaction against an owned subscription (dev/sandbox fallback).',
    description:
      "Mirror of `/payments/consultations/:bookingId/finalize`. When Chapa drops `tx_ref` from the return URL (common in sandbox), the return page hits this route with the `subscriptionId` we stamped into the URL ourselves. We re-verify the stored tx_ref against Chapa and advance the subscription lifecycle. Idempotent — safe to call multiple times.",
  })
  @ApiResponse({
    status: 200,
    schema: { example: { ok: true, status: 'active', active: true } },
  })
  finalizeSubscription(
    @CurrentUser() user: RequestUser,
    @Param('subscriptionId', new ParseUUIDPipe()) subscriptionId: string,
  ): Promise<{ ok: true; status: string; active: boolean }> {
    return this.payments.finalizeSubscriptionBySubscriptionId(
      user.id,
      subscriptionId,
    );
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

  @Post('consultations/:bookingId/finalize')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('access-token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Verify a Chapa transaction against an owned consultation booking',
    description:
      'Dev/sandbox fallback for the Chapa return flow. The patient must own the booking; we then re-verify the stored tx_ref against Chapa and advance the booking lifecycle (idempotent — safe to call multiple times). Use this when Chapa cannot reach the localhost webhook URL.',
  })
  @ApiResponse({ status: 200, schema: { example: { ok: true, status: 'pending_doctor_approval', paid: true } } })
  finalizeConsultation(
    @CurrentUser() user: RequestUser,
    @Param('bookingId', new ParseUUIDPipe()) bookingId: string,
  ): Promise<{ ok: true; status: string; paid: boolean }> {
    return this.payments.finalizeConsultationByBookingId(user.id, bookingId);
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

  @Get('subscription')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      'Phase 7 — current SubscriptionPlan-based subscription for this user (active or most-recent).',
  })
  @ApiResponse({ status: 200, type: MeSubscriptionResponseDto })
  getSubscription(
    @CurrentUser() user: RequestUser,
  ): Promise<MeSubscriptionResponseDto> {
    return this.payments.getMySubscription(user.id);
  }
}
