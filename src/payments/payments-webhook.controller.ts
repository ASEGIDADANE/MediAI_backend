import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payments/chapa')
export class PaymentsWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive Chapa webhook events',
  })
  @ApiResponse({ status: 200, schema: { example: { ok: true } } })
  webhook(
    @Body() body: Record<string, unknown>,
    @Headers('chapa-signature') chapaSignature: string | undefined,
    @Headers('x-chapa-signature') xChapaSignature: string | undefined,
  ): Promise<{ ok: true }> {
    return this.payments.handleChapaWebhook(body, {
      chapaSignature,
      xChapaSignature,
    });
  }
}
