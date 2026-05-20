import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ChapaClient } from './chapa.client';
import { MeBillingController, PaymentsController } from './payments.controller';
import { PersonalChatAccessService } from './personal-chat-access.service';
import { PaymentsService } from './payments.service';
import { PaymentsWebhookController } from './payments-webhook.controller';

@Module({
  imports: [PrismaModule, ConfigModule, AuthModule, NotificationsModule],
  controllers: [
    PaymentsController,
    PaymentsWebhookController,
    MeBillingController,
  ],
  providers: [PaymentsService, PersonalChatAccessService, ChapaClient],
  exports: [PaymentsService, PersonalChatAccessService],
})
export class PaymentsModule {}
