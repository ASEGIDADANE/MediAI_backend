import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import * as nodemailer from 'nodemailer';

const SUBJECT = 'Reset your MediAI password';

type EmailProvider = 'resend' | 'smtp';

/**
 * Transactional email (password reset). Uses Resend (default) or SMTP (Nodemailer).
 * SPF/DKIM/DMARC and domain verification are the deployer’s responsibility.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  private isProduction(): boolean {
    return this.config.get<string>('NODE_ENV') === 'production';
  }

  /** When true, send through provider in non-production (default: log only). */
  private sendRealInDev(): boolean {
    return this.config.get<string>('SEND_REAL_EMAIL_IN_DEV', '') === 'true';
  }

  private shouldUseProvider(): boolean {
    if (this.isProduction()) {
      return true;
    }
    return this.sendRealInDev();
  }

  private getProvider(): EmailProvider {
    const p = (this.config.get<string>('EMAIL_PROVIDER', 'resend') || 'resend').toLowerCase();
    if (p === 'smtp') {
      return 'smtp';
    }
    return 'resend';
  }

  private getFrom(): string {
    return this.config.get<string>('EMAIL_FROM', '').trim();
  }

  private buildBodies(resetUrl: string): { text: string; html: string } {
    const text = [
      'We received a request to reset your MediAI password.',
      '',
      'Open this link to choose a new password (it expires in one hour):',
      resetUrl,
      '',
      'If you did not request this, you can ignore this email.',
    ].join('\n');
    const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:0 auto;padding:1.5rem;">
<p>We received a request to reset your MediAI password.</p>
<p><a href="${this.escapeHtml(resetUrl)}">Reset your password</a></p>
<p style="color:#666;font-size:0.875rem">If you did not request this, you can ignore this email.</p>
</body></html>`;
    return { text, html };
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private logDevOnly(url: string, to: string): void {
    this.logger.log(`[dev] Password reset link for ${to}: ${url}`);
  }

  private logSendFailure(err: unknown, to: string): void {
    const message = err instanceof Error ? err.message : String(err);
    this.logger.error(
      `Password reset email failed for ${to}: ${message}`,
      err instanceof Error ? err.stack : undefined,
    );
  }

  async sendPasswordResetLink(to: string, resetUrl: string): Promise<void> {
    const { text, html } = this.buildBodies(resetUrl);

    if (!this.shouldUseProvider()) {
      this.logDevOnly(resetUrl, to);
      return;
    }

    const from = this.getFrom();
    if (!from) {
      this.logger.error(
        'EMAIL_FROM is not set; cannot send password reset email. Link not sent. Set EMAIL_FROM in production.',
      );
      if (!this.isProduction()) {
        this.logDevOnly(resetUrl, to);
      }
      return;
    }

    const provider = this.getProvider();

    try {
      if (provider === 'resend') {
        await this.sendWithResend(to, from, text, html, resetUrl);
        return;
      }
      await this.sendWithSmtp(to, from, text, html, resetUrl);
    } catch (e) {
      this.logSendFailure(e, to);
    }
  }

  private async sendWithResend(
    to: string,
    from: string,
    text: string,
    html: string,
    resetUrl: string,
  ): Promise<void> {
    const key = this.config.get<string>('RESEND_API_KEY', '')?.trim();
    if (!key) {
      this.logger.error(
        'RESEND_API_KEY is not set; cannot send via Resend. Set RESEND_API_KEY in production.',
      );
      if (!this.isProduction()) {
        this.logDevOnly(resetUrl, to);
      }
      return;
    }
    const resend = new Resend(key);
    const { data, error } = await resend.emails.send({
      from,
      to: [to],
      subject: SUBJECT,
      text,
      html,
    });
    if (error) {
      this.logger.error(
        `Resend error: ${error.message ?? JSON.stringify(error)} (to=${to})`,
      );
      return;
    }
    this.logger.log(`Password reset email sent via Resend to ${to} (id=${data?.id ?? 'n/a'})`);
  }

  private async sendWithSmtp(
    to: string,
    from: string,
    text: string,
    html: string,
    resetUrl: string,
  ): Promise<void> {
    const host = this.config.get<string>('SMTP_HOST', '')?.trim();
    const user = this.config.get<string>('SMTP_USER', '')?.trim();
    const pass = this.config.get<string>('SMTP_PASS', '')?.trim();
    const port = Number(this.config.get<string>('SMTP_PORT', '587')) || 587;
    const secure = this.config.get<string>('SMTP_SECURE', 'false') === 'true';

    if (!host) {
      this.logger.error('SMTP_HOST is not set; cannot send via SMTP.');
      if (!this.isProduction()) {
        this.logDevOnly(resetUrl, to);
      }
      return;
    }
    if (!user || !pass) {
      this.logger.error('SMTP_USER / SMTP_PASS must be set for SMTP delivery.');
      if (!this.isProduction()) {
        this.logDevOnly(resetUrl, to);
      }
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
    const info = await transporter.sendMail({
      from,
      to,
      subject: SUBJECT,
      text,
      html,
    });
    this.logger.log(`Password reset email sent via SMTP to ${to} (messageId=${info.messageId})`);
  }
}
