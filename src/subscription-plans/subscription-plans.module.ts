import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  SubscriptionPlansAdminController,
  SubscriptionPlansPublicController,
} from './subscription-plans.controller';
import { SubscriptionPlansService } from './subscription-plans.service';

@Module({
  imports: [AuthModule],
  controllers: [
    SubscriptionPlansPublicController,
    SubscriptionPlansAdminController,
  ],
  providers: [SubscriptionPlansService],
  exports: [SubscriptionPlansService],
})
export class SubscriptionPlansModule {}
