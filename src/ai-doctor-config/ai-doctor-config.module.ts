import { Module } from '@nestjs/common';
import { AiDoctorConfigController } from './ai-doctor-config.controller';
import { AiDoctorConfigService } from './ai-doctor-config.service';

@Module({
  controllers: [AiDoctorConfigController],
  providers: [AiDoctorConfigService],
})
export class AiDoctorConfigModule {}
