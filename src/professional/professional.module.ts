import { Module } from '@nestjs/common';
import { MeModule } from '../me/me.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ProfessionalController } from './professional.controller';
import { ProfessionalService } from './professional.service';

@Module({
  imports: [PrismaModule, MeModule],
  controllers: [ProfessionalController],
  providers: [ProfessionalService],
})
export class ProfessionalModule {}
