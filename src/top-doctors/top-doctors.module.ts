import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminTopDoctorsController } from './admin-top-doctors.controller';
import { TopDoctorsController } from './top-doctors.controller';
import { TopDoctorsService } from './top-doctors.service';

@Module({
  imports: [AuthModule],
  controllers: [TopDoctorsController, AdminTopDoctorsController],
  providers: [TopDoctorsService],
  exports: [TopDoctorsService],
})
export class TopDoctorsModule {}
