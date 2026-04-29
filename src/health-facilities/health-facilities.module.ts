import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { HealthFacilitiesController } from './health-facilities.controller';
import { HealthFacilitiesService } from './health-facilities.service';
import { OverpassService } from './overpass.service';

@Module({
  imports: [PrismaModule],
  controllers: [HealthFacilitiesController],
  providers: [HealthFacilitiesService, OverpassService],
  exports: [HealthFacilitiesService],
})
export class HealthFacilitiesModule {}
