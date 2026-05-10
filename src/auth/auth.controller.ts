import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthTokensDto } from './dto/auth-tokens.dto';
import { MessageResponseDto } from './dto/message-response.dto';
import { UserPublicDto } from './dto/user-public.dto';
import {
  CurrentUser,
  type RequestUser,
} from './decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create account (email + password)' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, description: 'Registered', type: AuthTokensDto })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async register(@Body() dto: RegisterDto): Promise<AuthTokensDto> {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Sign in with email and password' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Authenticated',
    type: AuthTokensDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto): Promise<AuthTokensDto> {
    return this.auth.login(dto);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Request password reset',
    description:
      'Always returns success message to avoid leaking whether the email exists. In development the reset URL is logged by the server.',
  })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<MessageResponseDto> {
    await this.auth.forgotPassword(dto);
    return {
      message: 'If an account exists for this email, a reset link was sent.',
    };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set a new password using a reset token' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 200, type: MessageResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid or expired token' })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<MessageResponseDto> {
    await this.auth.resetPassword(dto);
    return { message: 'Password has been reset. You can sign in now.' };
  }

  @Get('google')
  @ApiOperation({
    summary: 'Start Google OAuth',
    description:
      'Redirects to Google. Requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL.',
  })
  @ApiResponse({ status: 302, description: 'Redirect to Google' })
  @ApiResponse({ status: 503, description: 'Google OAuth not configured' })
  googleStart(@Res() res: Response): void {
    const url = this.auth.getGoogleAuthorizationUrl();
    res.redirect(HttpStatus.FOUND, url);
  }

  @Get('google/callback')
  @ApiOperation({
    summary: 'Google OAuth callback',
    description:
      'Exchanges the code, creates or links the user, then redirects to the frontend with accessToken query param (integrate with SPA carefully).',
  })
  @ApiQuery({ name: 'code', required: false })
  @ApiQuery({ name: 'error', required: false })
  @ApiResponse({
    status: 302,
    description: 'Redirect to frontend with token or error',
  })
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('error') oauthError: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const frontendBase = (
      process.env.FRONTEND_URL ?? 'http://localhost:3000'
    ).replace(/\/$/, '');

    if (oauthError) {
      res.redirect(
        HttpStatus.FOUND,
        `${frontendBase}/signin?error=${encodeURIComponent(oauthError)}`,
      );
      return;
    }

    if (!code) {
      res.redirect(
        HttpStatus.FOUND,
        `${frontendBase}/signin?error=missing_code`,
      );
      return;
    }

    try {
      const { accessToken } = await this.auth.completeGoogleOAuth(code);
      const redirectUrl = `${frontendBase}/dashboard?accessToken=${encodeURIComponent(accessToken)}`;
      res.redirect(HttpStatus.FOUND, redirectUrl);
    } catch {
      res.redirect(
        HttpStatus.FOUND,
        `${frontendBase}/signin?error=oauth_failed`,
      );
    }
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Current user (requires Bearer JWT)' })
  @ApiResponse({ status: 200, type: UserPublicDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  async me(@CurrentUser() user: RequestUser): Promise<UserPublicDto> {
    return this.auth.getProfile(user.id);
  }
}
