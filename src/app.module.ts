import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { join } from 'node:path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { LandingModule } from './landing/landing.module';
import { DashboardConfigModule } from './dashboard-config/dashboard-config.module';
import { ChatModule } from './chat/chat.module';
import { AiDoctorConfigModule } from './ai-doctor-config/ai-doctor-config.module';
import { AdminConfigModule } from './admin-config/admin-config.module';
import { MeModule } from './me/me.module';
import { TopDoctorsModule } from './top-doctors/top-doctors.module';
import { BlogModule } from './blog/blog.module';
import { EducationModule } from './education/education.module';
import { HealthFacilitiesModule } from './health-facilities/health-facilities.module';
import { ProfessionalModule } from './professional/professional.module';
import { MessagesModule } from './messages/messages.module';
import { SubscriptionPlansModule } from './subscription-plans/subscription-plans.module';
import { PaymentsModule } from './payments/payments.module';
import { ConsultationsModule } from './consultations/consultations.module';
import { AvailabilityModule } from './availability/availability.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Same backend-root `.env` as `load-env.ts` (do not rely on `process.cwd()`).
      envFilePath: join(__dirname, '..', '.env'),
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    PrismaModule,
    AuthModule,
    OnboardingModule,
    LandingModule,
    DashboardConfigModule,
    ChatModule,
    AiDoctorConfigModule,
    AdminConfigModule,
    MeModule,
    TopDoctorsModule,
    BlogModule,
    EducationModule,
    HealthFacilitiesModule,
    ProfessionalModule,
    MessagesModule,
    SubscriptionPlansModule,
    PaymentsModule,
    ConsultationsModule,
    AvailabilityModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
