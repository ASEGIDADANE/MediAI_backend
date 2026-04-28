import { Module } from '@nestjs/common';
import { DashboardConfigController } from './dashboard-config.controller';
import { DashboardConfigService } from './dashboard-config.service';

@Module({
  controllers: [DashboardConfigController],
  providers: [DashboardConfigService],
})
export class DashboardConfigModule {}
