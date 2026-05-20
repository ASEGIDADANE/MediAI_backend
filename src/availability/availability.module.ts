import { Module } from '@nestjs/common';
import { MeModule } from '../me/me.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AvailabilityService } from './availability.service';
import { ProfessionalAvailabilityController } from './professional-availability.controller';
import { DoctorsAvailabilityController } from './doctors-availability.controller';

@Module({
  imports: [PrismaModule, MeModule],
  controllers: [
    ProfessionalAvailabilityController,
    DoctorsAvailabilityController,
  ],
  providers: [AvailabilityService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
