import { Module } from '@nestjs/common';
import { MeModule } from '../me/me.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProfessionalController } from './professional.controller';
import { ProfessionalService } from './professional.service';
import { ProfessionalBookingsController } from './professional-bookings.controller';
import { ProfessionalBookingsService } from './professional-bookings.service';

@Module({
  imports: [PrismaModule, MeModule, NotificationsModule],
  controllers: [ProfessionalController, ProfessionalBookingsController],
  providers: [ProfessionalService, ProfessionalBookingsService],
})
export class ProfessionalModule {}
