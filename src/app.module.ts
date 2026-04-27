import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
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
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
