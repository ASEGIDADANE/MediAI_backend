import { Injectable } from '@nestjs/common';
import {
  AccountAuditAction,
  OnboardingUserRole,
  UserAppRole,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { takeSkipFromPagination } from './dto/admin-pagination-query.dto';
import { clampActivityLimit } from './dto/admin-recent-activity-query.dto';
import type { AdminActivityType } from './dto/admin-response.dtos';
import type { AdminSupportReportsQueryDto } from './dto/admin-support-reports-query.dto';
import type { AdminUsersQueryDto } from './dto/admin-users-query.dto';

const MESSAGE_PREVIEW_MAX = 500;

// Maps each AccountAuditAction enum value to the activity feed `type` and a
// short human description fragment. The description is intentionally generic
// (no PHI) — it identifies *what* happened, not *what data* was touched.
const AUDIT_ACTION_DESCRIPTOR: Record<
  AccountAuditAction,
  { type: AdminActivityType; verb: string }
> = {
  [AccountAuditAction.profile_patch]: {
    type: 'profile_update',
    verb: 'updated their profile',
  },
  [AccountAuditAction.medical_history_put]: {
    type: 'medical_history_update',
    verb: 'updated medical history',
  },
  [AccountAuditAction.ai_doctor_setup_patch]: {
    type: 'ai_doctor_setup',
    verb: 'updated AI Doctor setup',
  },
  [AccountAuditAction.data_export]: {
    type: 'data_export',
    verb: 'exported their account data',
  },
  [AccountAuditAction.account_delete_initiated]: {
    type: 'account_delete',
    verb: 'started account deletion',
  },
};

type RawProfile = {
  role: OnboardingUserRole;
  preferredName: string | null;
  professionalProfile: unknown;
} | null;

function extractSpecialty(prof: RawProfile): string | null {
  if (!prof || prof.role !== OnboardingUserRole.professional) return null;
  const json = prof.professionalProfile;
  if (
    json &&
    typeof json === 'object' &&
    'specialty' in (json as Record<string, unknown>)
  ) {
    const v = (json as Record<string, unknown>).specialty;
    return typeof v === 'string' && v.trim() !== '' ? v : null;
  }
  return null;
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(dto: AdminUsersQueryDto) {
    const { take, skip, page, pageSize } = takeSkipFromPagination(
      dto.page,
      dto.pageSize,
    );
    const q = dto.q?.trim();
    const where =
      q && q.length > 0
        ? { email: { contains: q, mode: 'insensitive' as const } }
        : {};

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        select: {
          id: true,
          email: true,
          appRole: true,
          createdAt: true,
          updatedAt: true,
          profile: {
            select: {
              role: true,
              preferredName: true,
              professionalProfile: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const items = rows.map((r) => ({
      id: r.id,
      email: r.email,
      appRole: r.appRole,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      hasProfile: r.profile !== null,
      profileRole: r.profile
        ? (r.profile.role === OnboardingUserRole.personal
            ? ('personal' as const)
            : ('professional' as const))
        : null,
      preferredName: r.profile?.preferredName ?? null,
      specialty: extractSpecialty(r.profile),
    }));

    return { items, page, pageSize, total };
  }

  async listSupportReports(dto: AdminSupportReportsQueryDto) {
    const { take, skip, page, pageSize } = takeSkipFromPagination(
      dto.page,
      dto.pageSize,
    );
    const where = dto.userId
      ? { userId: dto.userId as string }
      : {};

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.supportReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        select: { id: true, userId: true, message: true, createdAt: true },
      }),
      this.prisma.supportReport.count({ where }),
    ]);

    const items = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      messagePreview:
        r.message.length > MESSAGE_PREVIEW_MAX
          ? `${r.message.slice(0, MESSAGE_PREVIEW_MAX - 1)}…`
          : r.message,
      createdAt: r.createdAt.toISOString(),
    }));

    return { items, page, pageSize, total };
  }

  /**
   * Recent activity feed for the admin dashboard. Merges three real sources
   * sorted by their own timestamp:
   *   - new signups (User.createdAt)
   *   - per-user audit log events (AccountAuditLog) — profile/medical/AI-doctor changes
   *   - support reports (SupportReport.createdAt)
   *
   * Each source is fetched with `take = limit` so the merged-then-trimmed
   * result always contains the freshest `limit` items overall, regardless of
   * how the activity is distributed across sources. Descriptions are PHI-free:
   * they say *what* happened, never *what fields*.
   */
  async getRecentActivity({ limit }: { limit?: number } = {}) {
    const cap = clampActivityLimit(limit);

    const [users, audits, reports] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: cap,
        select: { id: true, email: true, createdAt: true },
      }),
      this.prisma.accountAuditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: cap,
        select: {
          id: true,
          action: true,
          createdAt: true,
          user: { select: { email: true } },
        },
      }),
      this.prisma.supportReport.findMany({
        orderBy: { createdAt: 'desc' },
        take: cap,
        select: {
          id: true,
          createdAt: true,
          user: { select: { email: true } },
        },
      }),
    ]);

    type Item = {
      id: string;
      type: AdminActivityType;
      description: string;
      createdAt: string;
    };
    const items: Item[] = [];

    for (const u of users) {
      items.push({
        id: `signup_${u.id}`,
        type: 'signup',
        description: `${u.email} signed up`,
        createdAt: u.createdAt.toISOString(),
      });
    }

    for (const a of audits) {
      const descriptor = AUDIT_ACTION_DESCRIPTOR[a.action];
      const subject = a.user?.email ?? 'A user';
      items.push({
        id: `audit_${a.id}`,
        type: descriptor.type,
        description: `${subject} ${descriptor.verb}`,
        createdAt: a.createdAt.toISOString(),
      });
    }

    for (const r of reports) {
      items.push({
        id: `support_${r.id}`,
        type: 'support_report',
        description: `${r.user?.email ?? 'An anonymous visitor'} submitted a support report`,
        createdAt: r.createdAt.toISOString(),
      });
    }

    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { items: items.slice(0, cap) };
  }

  async getSummary() {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      userCount,
      profileCount,
      supportReportCount,
      adminCount,
      last24hRegistrations,
    ] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.userProfile.count(),
      this.prisma.supportReport.count(),
      this.prisma.user.count({ where: { appRole: UserAppRole.admin } }),
      this.prisma.user.count({
        where: { createdAt: { gte: dayAgo } },
      }),
    ]);

    return {
      userCount,
      profileCount,
      supportReportCount,
      adminCount,
      last24hRegistrations,
    };
  }

  /**
   * Real billing snapshot for `/admin/subscriptions`. Replaces the legacy
   * hard-coded `revenueSummary` and `transactions` arrays.
   *
   * Until a payment provider is integrated:
   *   - `totalRevenueCents` and `monthlyRecurringRevenueCents` are 0
   *   - `transactions` is `[]`
   *   - `paymentProviderConnected` is `false` so the UI can show a
   *     "Connect a payment provider" empty state
   *
   * `activeSubscriptions` is the live non-admin user count (everyone is on
   * the free tier today). Once paid tiers are wired this should narrow to
   * "users with a paid subscription".
   */
  async getBillingSummary() {
    const activeSubscriptions = await this.prisma.user.count({
      where: { appRole: UserAppRole.user },
    });

    const currency = 'USD';
    const zeroDisplay = formatBillingPrice(0, currency);

    return {
      totalRevenueCents: 0,
      totalRevenueDisplay: zeroDisplay,
      currency,
      activeSubscriptions,
      monthlyRecurringRevenueCents: 0,
      monthlyRecurringRevenueDisplay: zeroDisplay,
      churnRatePercent: null,
      paymentProviderConnected: false,
      transactions: [] as Array<{
        id: string;
        userEmail: string;
        planName: string;
        amountCents: number;
        amountDisplay: string;
        currency: string;
        status: 'completed' | 'pending' | 'failed';
        createdAt: string;
      }>,
    };
  }
}

/**
 * Local copy of the cents formatter — duplicated here to keep AdminService
 * free of an explicit dependency on the SubscriptionPlans module.
 */
function formatBillingPrice(cents: number, currency: string): string {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
