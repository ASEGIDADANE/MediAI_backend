import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ChapaClient } from './chapa.client';
import { MeBillingController, PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentsWebhookController } from './payments-webhook.controller';

@Module({
  imports: [PrismaModule, ConfigModule, AuthModule],
  controllers: [
    PaymentsController,
    PaymentsWebhookController,
    MeBillingController,
  ],
  providers: [PaymentsService, ChapaClient],
  exports: [PaymentsService],
})
export class PaymentsModule {}
