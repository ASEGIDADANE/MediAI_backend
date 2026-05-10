import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { EmailModule } from '../email/email.module';
import { resolveJwtSecret } from './jwt-config.util';
import { RolesGuard } from './guards/roles.guard';
import { OptionalJwtAuthGuard } from './guards/optional-jwt.guard';

@Module({
  imports: [
    ConfigModule,
    EmailModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: resolveJwtSecret(config),
        signOptions: {
          expiresIn: config.get<string>(
            'JWT_EXPIRES',
            '7d',
          ) as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RolesGuard, OptionalJwtAuthGuard],
  exports: [
    AuthService,
    JwtModule,
    PassportModule,
    JwtStrategy,
    RolesGuard,
    OptionalJwtAuthGuard,
  ],
})
export class AuthModule {}
