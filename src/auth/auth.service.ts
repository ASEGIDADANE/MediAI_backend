import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import type { UserAppRole } from '../generated/prisma/client';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const BCRYPT_ROUNDS = 12;
const RESET_TOKEN_BYTES = 32;
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

export type AuthUserView = { id: string; email: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private hashResetToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private getGoogleClient(): OAuth2Client | null {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.config.get<string>('GOOGLE_CALLBACK_URL');
    if (!clientId?.trim() || !clientSecret?.trim() || !redirectUri?.trim()) {
      return null;
    }
    return new OAuth2Client(clientId, clientSecret, redirectUri);
  }

  isGoogleOAuthConfigured(): boolean {
    return this.getGoogleClient() !== null;
  }

  getGoogleAuthorizationUrl(): string {
    const client = this.getGoogleClient();
    if (!client) {
      throw new ServiceUnavailableException(
        'Google OAuth is not configured (set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL)',
      );
    }
    return client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
      prompt: 'select_account',
    });
  }

  async completeGoogleOAuth(code: string): Promise<{ accessToken: string; user: AuthUserView }> {
    const client = this.getGoogleClient();
    if (!client) {
      throw new ServiceUnavailableException('Google OAuth is not configured');
    }

    let tokens;
    try {
      const result = await client.getToken(code);
      tokens = result.tokens;
    } catch {
      throw new UnauthorizedException('Invalid or expired Google authorization code');
    }

    if (!tokens.access_token) {
      throw new UnauthorizedException('Google did not return an access token');
    }

    const profileRes = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    );
    if (!profileRes.ok) {
      throw new UnauthorizedException('Could not load Google profile');
    }

    const profile = (await profileRes.json()) as {
      id?: string;
      email?: string;
      verified_email?: boolean;
    };

    const googleId = profile.id;
    const email = profile.email ? this.normalizeEmail(profile.email) : null;

    if (!googleId || !email) {
      throw new UnauthorizedException('Google profile missing id or email');
    }

    if (profile.verified_email === false) {
      throw new UnauthorizedException('Google email is not verified');
    }

    let user = await this.prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: { email, googleId, passwordHash: null },
      });
    } else {
      const updates: { googleId?: string; email?: string } = {};
      if (user.googleId !== googleId) updates.googleId = googleId;
      if (this.normalizeEmail(user.email) !== email) updates.email = email;
      if (Object.keys(updates).length > 0) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: updates,
        });
      }
    }

    const accessToken = await this.signAccessToken(user.id, user.email, user.appRole);
    return { accessToken, user: { id: user.id, email: user.email } };
  }

  private async signAccessToken(
    userId: string,
    email: string,
    appRole: UserAppRole,
  ): Promise<string> {
    return this.jwt.signAsync({ sub: userId, email, appRole });
  }

  async register(dto: RegisterDto): Promise<{ accessToken: string; user: AuthUserView }> {
    const email = this.normalizeEmail(dto.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: { email, passwordHash },
    });

    const accessToken = await this.signAccessToken(user.id, user.email, user.appRole);
    return { accessToken, user: { id: user.id, email: user.email } };
  }

  async login(dto: LoginDto): Promise<{ accessToken: string; user: AuthUserView }> {
    const email = this.normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const accessToken = await this.signAccessToken(user.id, user.email, user.appRole);
    return { accessToken, user: { id: user.id, email: user.email } };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const email = this.normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({ where: { email } });

    const genericMessage =
      'If an account exists for this email, a reset link was sent.';

    if (!user?.passwordHash) {
      return;
    }

    const raw = randomBytes(RESET_TOKEN_BYTES).toString('hex');
    const tokenHash = this.hashResetToken(raw);
    const expiresAt = new Date(Date.now() + RESET_TTL_MS);

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const frontend = this.config.get<string>('FRONTEND_URL', 'http://localhost:3000').replace(/\/$/, '');
    const resetUrl = `${frontend}/reset-password?token=${encodeURIComponent(raw)}`;

    await this.email.sendPasswordResetLink(email, resetUrl);
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = this.hashResetToken(dto.token);

    const record = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!record) {
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);
  }

  async getProfile(userId: string): Promise<AuthUserView> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException();
    }
    return { id: user.id, email: user.email };
  }
}
