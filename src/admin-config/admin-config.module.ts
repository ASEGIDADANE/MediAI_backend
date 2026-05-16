import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from '../admin/admin.controller';
import { AdminService } from '../admin/admin.service';
import { PaymentsModule } from '../payments/payments.module';
import { AdminConfigController } from './admin-config.controller';
import { AdminConfigService } from './admin-config.service';

@Module({
  imports: [AuthModule, PaymentsModule],
  controllers: [AdminConfigController, AdminController],
  providers: [AdminConfigService, AdminService],
})
export class AdminConfigModule {}
