import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  NotificationType,
  Notification,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import type { NotificationItemDto } from './dto/notification-response.dto';
import { takeSkipNotifications } from './dto/notifications-query.dto';

/**
 * Phase 6 — input shape accepted by `NotificationsService.enqueue`. Callers
 * never construct a Prisma payload directly; the service handles the JSON
 * coercion + email fan-out.
 */
export type EnqueueNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Optional in-app deep link (path under MediAI; not a full URL). */
  actionUrl?: string | null;
  /** Structured payload for the UI; safe-to-log (no PHI). */
  metadata?: Record<string, unknown> | null;
  /**
   * Channels to dispatch on. The in-app row is always written; `email`
   * additionally sends a transactional email when the recipient has one.
   * Defaults to in-app only — opt in per-event to avoid email spam.
   */
  channels?: ('inApp' | 'email')[];
  /**
   * Override the email subject (defaults to the `title`). Useful when the
   * in-app copy is concise but the email needs more context.
   */
  emailSubject?: string;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  /* -------------------------------------------------------------------- */
  /*  Write path                                                          */
  /* -------------------------------------------------------------------- */

  /**
   * Drop a notification into a user's inbox and (optionally) send the
   * matching transactional email. Every booking-lifecycle hook funnels
   * through here so the bell dropdown is the single source of truth.
   *
   * Failures inside this function are *swallowed and logged* — we never
   * want a notification side-effect to roll back the underlying booking
   * write. The caller treats this as fire-and-forget.
   */
  async enqueue(input: EnqueueNotificationInput): Promise<void> {
    const channels = input.channels ?? ['inApp'];
    if (channels.includes('inApp')) {
      try {
        await this.prisma.notification.create({
          data: {
            userId: input.userId,
            type: input.type,
            title: input.title.slice(0, 160),
            body: input.body.slice(0, 1000),
            actionUrl: input.actionUrl?.trim() || null,
            metadata:
              input.metadata == null
                ? Prisma.JsonNull
                : (input.metadata as Prisma.InputJsonValue),
          },
        });
      } catch (err) {
        this.logger.error(
          `Failed to persist in-app notification for user=${input.userId} type=${input.type}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (channels.includes('email')) {
      // Side-effect; never blocking. Fire and don't await so the surface
      // call (e.g. approve booking) doesn't pay an SMTP round-trip cost.
      void this.dispatchEmail(input).catch((err) => {
        this.logger.error(
          `Failed to dispatch email notification for user=${input.userId} type=${input.type}: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }
  }

  private async dispatchEmail(input: EnqueueNotificationInput): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { email: true },
    });
    if (!user?.email) return;

    const subject = (input.emailSubject ?? input.title).slice(0, 200);
    await this.email.sendTransactional({
      to: user.email,
      subject,
      text: this.toEmailText(input),
      html: this.toEmailHtml(input),
    });
  }

  private toEmailText(input: EnqueueNotificationInput): string {
    const lines = [input.title, '', input.body];
    if (input.actionUrl) {
      lines.push('', `Open MediAI: ${input.actionUrl}`);
    }
    lines.push('', '— MediAI');
    return lines.join('\n');
  }

  private toEmailHtml(input: EnqueueNotificationInput): string {
    // Intentionally minimal — same visual language as the password-reset
    // email so the brand stays consistent without dragging in a template
    // engine. Anything fancier (logos, MJML) can replace this later
    // without touching callers.
    const safeTitle = escapeHtml(input.title);
    const safeBody = escapeHtml(input.body).replace(/\n/g, '<br/>');
    const cta = input.actionUrl
      ? `<p style="margin-top:1.5rem"><a href="${escapeHtml(input.actionUrl)}" style="background:#4c68dc;color:#ffffff;padding:0.6rem 1.1rem;border-radius:0.5rem;text-decoration:none;font-weight:600;">Open MediAI</a></p>`
      : '';
    return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:0 auto;padding:1.5rem;color:#111;">
<h2 style="margin:0 0 0.5rem">${safeTitle}</h2>
<p style="line-height:1.5">${safeBody}</p>
${cta}
<p style="color:#666;font-size:0.875rem;margin-top:2rem">— MediAI</p>
</body></html>`;
  }

  /* -------------------------------------------------------------------- */
  /*  Read path                                                           */
  /* -------------------------------------------------------------------- */

  async list(
    userId: string,
    dto: { page?: number; pageSize?: number; unreadOnly?: boolean },
  ) {
    const { take, skip, page, pageSize } = takeSkipNotifications(
      dto.page,
      dto.pageSize,
    );
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(dto.unreadOnly ? { readAt: null } : {}),
    };

    const [rows, total, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      this.prisma.notification.count({ where }),
      // Global unread count — independent of the current filter so the bell
      // badge stays correct even when the user is browsing the "all" tab.
      this.prisma.notification.count({
        where: { userId, readAt: null },
      }),
    ]);

    return {
      items: rows.map(toNotificationItemDto),
      total,
      unreadCount,
      page,
      pageSize,
    };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, readAt: null },
    });
  }

  async markRead(userId: string, id: string): Promise<NotificationItemDto> {
    const existing = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!existing) {
      // Don't leak whether the id belongs to a different user.
      throw new NotFoundException('Notification not found.');
    }
    const updated = existing.readAt
      ? existing
      : await this.prisma.notification.update({
          where: { id },
          data: { readAt: new Date() },
        });
    return toNotificationItemDto(updated);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const res = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: res.count };
  }
}

export function toNotificationItemDto(row: Notification): NotificationItemDto {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    actionUrl: row.actionUrl,
    metadata:
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
