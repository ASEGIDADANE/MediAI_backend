import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { HealthFacilitiesController } from './health-facilities.controller';
import { HealthFacilitiesService } from './health-facilities.service';

@Module({
  imports: [PrismaModule],
  controllers: [HealthFacilitiesController],
  providers: [HealthFacilitiesService],
  exports: [HealthFacilitiesService],
})
export class HealthFacilitiesModule {}
