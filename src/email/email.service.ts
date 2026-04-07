import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Password-reset and transactional email.
 * Replace with SMTP / SendGrid / Resend in production.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendPasswordResetLink(email: string, resetUrl: string): Promise<void> {
    const isProd = this.config.get<string>('NODE_ENV') === 'production';
    if (isProd) {
      this.logger.warn(
        `Password reset requested for ${email} — implement a real mail provider; link not sent.`,
      );
      return;
    }
    this.logger.log(`[dev] Password reset link for ${email}: ${resetUrl}`);
  }
}
