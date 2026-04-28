import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EducationController } from './education.controller';
import { EducationAdminController } from './education-admin.controller';
import { EducationService } from './education.service';

@Module({
  imports: [AuthModule],
  controllers: [EducationController, EducationAdminController],
  providers: [EducationService],
  exports: [EducationService],
})
export class EducationModule {}
