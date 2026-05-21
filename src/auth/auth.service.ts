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
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const BCRYPT_ROUNDS = 12;
const RESET_TOKEN_BYTES = 32;
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

const REFRESH_TOKEN_BYTES = 64;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_REFRESH_TOKENS_PER_USER = 5;

export type AuthUserView = {
  id: string;
  email: string;
  emailVerified: boolean;
  lastLoginAt: string | null;
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  user: AuthUserView;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private toUserView(user: {
    id: string;
    email: string;
    emailVerifiedAt: Date | null;
    lastLoginAt: Date | null;
  }): AuthUserView {
    return {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerifiedAt !== null,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    };
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

  // ---------------------------------------------------------------------------
  // Token issuance
  // ---------------------------------------------------------------------------

  private async signAccessToken(userId: string, email: string): Promise<string> {
    const expiresIn = (
      this.config.get<string>('ACCESS_TOKEN_EXPIRES', '15m')
    ) as import('@nestjs/jwt').JwtSignOptions['expiresIn'];
    return this.jwt.signAsync({ sub: userId, email }, { expiresIn });
  }

  /**
   * Issues an access token + refresh token pair.
   * Stores the hashed refresh token in the DB.
   * Prunes oldest tokens when the user exceeds MAX_REFRESH_TOKENS_PER_USER.
   */
  private async issueTokenPair(
    userId: string,
    email: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = await this.signAccessToken(userId, email);

    // Generate raw refresh token — only the hash is stored
    const rawRefresh = randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const tokenHash = this.hashToken(rawRefresh);
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

    // Prune oldest tokens if user already has MAX_REFRESH_TOKENS_PER_USER
    const existing = await this.prisma.refreshToken.findMany({
      where: { userId, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
    });

    if (existing.length >= MAX_REFRESH_TOKENS_PER_USER) {
      const toDelete = existing
        .slice(0, existing.length - MAX_REFRESH_TOKENS_PER_USER + 1)
        .map((t) => t.id);
      await this.prisma.refreshToken.deleteMany({ where: { id: { in: toDelete } } });
    }

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    return { accessToken, refreshToken: rawRefresh };
  }

  // ---------------------------------------------------------------------------
  // Google OAuth
  // ---------------------------------------------------------------------------

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

  async completeGoogleOAuth(code: string): Promise<TokenPair> {
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

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
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

    const now = new Date();
    if (!user) {
      user = await this.prisma.user.create({
        data: { email, googleId, passwordHash: null, emailVerifiedAt: now, lastLoginAt: now },
      });
    } else {
      const updates: {
        googleId?: string;
        email?: string;
        emailVerifiedAt?: Date;
        lastLoginAt: Date;
      } = { lastLoginAt: now };
      if (user.googleId !== googleId) updates.googleId = googleId;
      if (this.normalizeEmail(user.email) !== email) updates.email = email;
      if (!user.emailVerifiedAt) updates.emailVerifiedAt = now;
      user = await this.prisma.user.update({ where: { id: user.id }, data: updates });
    }

    const { accessToken, refreshToken } = await this.issueTokenPair(user.id, user.email);
    return { accessToken, refreshToken, user: this.toUserView(user) };
  }

  // ---------------------------------------------------------------------------
  // Register / Login
  // ---------------------------------------------------------------------------

  async register(dto: RegisterDto): Promise<TokenPair> {
    const email = this.normalizeEmail(dto.email);
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const now = new Date();
    const user = await this.prisma.user.create({
      data: { email, passwordHash, lastLoginAt: now },
    });

    const { accessToken, refreshToken } = await this.issueTokenPair(user.id, user.email);
    return { accessToken, refreshToken, user: this.toUserView(user) };
  }

  async login(dto: LoginDto): Promise<TokenPair> {
    const email = this.normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const { accessToken, refreshToken } = await this.issueTokenPair(updated.id, updated.email);
    return { accessToken, refreshToken, user: this.toUserView(updated) };
  }

  // ---------------------------------------------------------------------------
  // Refresh token rotation
  // ---------------------------------------------------------------------------

  /**
   * Validates a raw refresh token, marks it as used (in a transaction),
   * and issues a fresh token pair (rotation).
   * Throws 401 if the token is invalid, expired, or already used.
   */
  async rotateRefreshToken(rawToken: string): Promise<TokenPair> {
    const tokenHash = this.hashToken(rawToken);

    const record = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
    });

    if (!record) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Mark old token as used and issue new pair atomically
    const [, newPair] = await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });

      const rawRefresh = randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
      const newHash = this.hashToken(rawRefresh);
      const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

      await tx.refreshToken.create({
        data: { userId: record.userId, tokenHash: newHash, expiresAt },
      });

      const accessToken = await this.signAccessToken(record.userId, record.user.email);
      return [null, { accessToken, refreshToken: rawRefresh }];
    });

    return {
      accessToken: newPair.accessToken,
      refreshToken: newPair.refreshToken,
      user: this.toUserView(record.user),
    };
  }

  /**
   * Revokes a specific refresh token (logout).
   * Silently succeeds if the token is not found (idempotent).
   */
  async revokeRefreshToken(rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, usedAt: null },
      data: { usedAt: new Date() },
    });
  }

  // ---------------------------------------------------------------------------
  // Password reset
  // ---------------------------------------------------------------------------

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const email = this.normalizeEmail(dto.email);
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user?.passwordHash) {
      return;
    }

    const raw = randomBytes(RESET_TOKEN_BYTES).toString('hex');
    const tokenHash = this.hashToken(raw);
    const expiresAt = new Date(Date.now() + RESET_TTL_MS);

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const frontend = this.config
      .get<string>('FRONTEND_URL', 'http://localhost:3000')
      .replace(/\/$/, '');
    const resetUrl = `${frontend}/reset-password?token=${encodeURIComponent(raw)}`;

    await this.email.sendPasswordResetLink(email, resetUrl);
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = this.hashToken(dto.token);

    const record = await this.prisma.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
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

  // ---------------------------------------------------------------------------
  // Profile
  // ---------------------------------------------------------------------------

  async getProfile(userId: string): Promise<AuthUserView> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.toUserView(user);
  }
}
