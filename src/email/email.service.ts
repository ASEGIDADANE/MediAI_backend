import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { request as httpsRequest } from 'https';
import * as nodemailer from 'nodemailer';

const SUBJECT = 'Reset your MediAI password';
const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const RESEND_TIMEOUT_MS = 15_000;

type EmailProvider = 'resend' | 'smtp';

type ResendSuccess = { id: string };
type ResendErrorBody = {
  name?: string;
  message?: string;
  statusCode?: number;
};

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
    const p = (
      this.config.get<string>('EMAIL_PROVIDER', 'resend') || 'resend'
    ).toLowerCase();
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

    try {
      const result = await this.callResendApi(key, {
        from,
        to: [to],
        subject: SUBJECT,
        text,
        html,
      });
      this.logger.log(
        `Password reset email sent via Resend to ${to} (id=${result.id})`,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.error(`Resend error: ${message} (to=${to})`);
    }
  }

  /**
   * POST to Resend's REST API via Node's `https` module instead of using the
   * `resend` SDK (which calls `fetch()` internally). Reason: in long-running
   * Nest processes the undici connection pool that powers `fetch` can hold
   * on to a half-dead socket after a single network blip, after which every
   * subsequent fetch in the same process throws "Unable to fetch data" —
   * even though a fresh `curl` from the same machine still works. Same
   * mitigation pattern we use in `OverpassService.callOverpass()`. Opens a
   * brand-new TCP connection per call (`Connection: close`), which is fine
   * for transactional email volume.
   */
  private callResendApi(
    apiKey: string,
    payload: {
      from: string;
      to: string[];
      subject: string;
      text: string;
      html: string;
    },
  ): Promise<ResendSuccess> {
    const url = new URL(RESEND_ENDPOINT);
    const body = JSON.stringify(payload);
    return new Promise<ResendSuccess>((resolve, reject) => {
      const req = httpsRequest(
        {
          method: 'POST',
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname + url.search,
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
            'User-Agent': 'mediai-backend',
            Accept: 'application/json',
            Connection: 'close',
          },
          // Bypass https.globalAgent so we get a fresh, isolated TCP socket
          // every call — same defensive pattern as OverpassService, plus extra
          // insurance against any pool/agent contamination from other code.
          agent: false,
          timeout: RESEND_TIMEOUT_MS,
        },
        (res) => {
          const status = res.statusCode ?? 0;
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            if (status < 200 || status >= 300) {
              const detail = parseResendErrorMessage(raw, status);
              reject(new Error(`Resend HTTP ${status}: ${detail}`));
              return;
            }
            try {
              const parsed = JSON.parse(raw) as Partial<ResendSuccess>;
              if (!parsed.id) {
                reject(new Error(`Resend response missing id: ${raw}`));
                return;
              }
              resolve({ id: parsed.id });
            } catch (e) {
              reject(e instanceof Error ? e : new Error(String(e)));
            }
          });
          res.on('error', reject);
        },
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy(new Error('Resend request timed out'));
      });
      req.write(body);
      req.end();
    });
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
    this.logger.log(
      `Password reset email sent via SMTP to ${to} (messageId=${info.messageId})`,
    );
  }
}

/**
 * Pull a useful human message out of a Resend non-2xx response body.
 * Examples:
 *   422 → `{"name":"validation_error","message":"You can only send testing
 *           emails to your own email address (mubaarakadem@gmail.com)."}`
 *   401 → `{"name":"missing_api_key","message":"Missing API key..."}`
 * Falls back to the raw body or a generic `HTTP <code>` if parsing fails.
 */
function parseResendErrorMessage(rawBody: string, statusCode: number): string {
  if (!rawBody) return `HTTP ${statusCode}`;
  try {
    const parsed = JSON.parse(rawBody) as ResendErrorBody;
    const parts = [parsed.name, parsed.message].filter(
      (s): s is string => typeof s === 'string' && s.length > 0,
    );
    if (parts.length > 0) return parts.join(' — ');
  } catch {
    // not JSON; fall through to raw
  }
  return rawBody.length > 240 ? `${rawBody.slice(0, 240)}…` : rawBody;
}
