import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccountAuditAction,
  OnboardingUserRole,
  Prisma,
  ProfessionalVerificationStatus,
  UserAppRole,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { formatPaymentPrice } from '../payments/payment-format.util';
import { readBothConsultationFeesMajor } from '../consultations/consultation-profile-fees.util';
import { takeSkipFromPagination } from './dto/admin-pagination-query.dto';
import type {
  AdminProfessionalVerificationsQueryDto,
  AdminVerificationFilter,
} from './dto/admin-professional-verifications-query.dto';
import { clampActivityLimit } from './dto/admin-recent-activity-query.dto';
import type {
  AdminActivityType,
  AdminVerificationStatus,
} from './dto/admin-response.dtos';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

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
        ? r.profile.role === OnboardingUserRole.personal
          ? ('personal' as const)
          : ('professional' as const)
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
    const where = dto.userId ? { userId: dto.userId } : {};

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

  /* ------------------------------------------------------------------ */
  /*  Doctor verification queue                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Build the Prisma `where` clause for the verification queue from the
   * admin-supplied `status` filter. `awaiting` is the operationally useful
   * default — only professionals who actually clicked "Submit for review"
   * and are still pending.
   */
  private verificationFilterToWhere(
    filter: AdminVerificationFilter,
  ): Prisma.UserProfileWhereInput {
    const base: Prisma.UserProfileWhereInput = {
      role: OnboardingUserRole.professional,
    };
    switch (filter) {
      case 'all':
        return base;
      case 'verified':
        return {
          ...base,
          verificationStatus: ProfessionalVerificationStatus.verified,
        };
      case 'rejected':
        return {
          ...base,
          verificationStatus: ProfessionalVerificationStatus.rejected,
        };
      case 'pending':
        return {
          ...base,
          verificationStatus: ProfessionalVerificationStatus.pending,
        };
      case 'awaiting':
      default:
        return {
          ...base,
          verificationStatus: ProfessionalVerificationStatus.pending,
          verificationSubmittedAt: { not: null },
        };
    }
  }

  async listProfessionalVerifications(
    dto: AdminProfessionalVerificationsQueryDto,
  ) {
    const { take, skip, page, pageSize } = takeSkipFromPagination(
      dto.page,
      dto.pageSize,
    );
    const where = this.verificationFilterToWhere(dto.status ?? 'awaiting');

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.userProfile.findMany({
        where,
        // Awaiting submissions go oldest-first so the admin works the queue
        // FIFO; everything else newest-first by creation time.
        orderBy:
          (dto.status ?? 'awaiting') === 'awaiting'
            ? [{ verificationSubmittedAt: 'asc' }]
            : [{ verificationReviewedAt: 'desc' }, { createdAt: 'desc' }],
        take,
        skip,
        select: {
          userId: true,
          professionalProfile: true,
          verificationStatus: true,
          verificationSubmittedAt: true,
          verificationReviewedAt: true,
          verificationReviewedBy: true,
          verificationNotes: true,
          createdAt: true,
          user: { select: { email: true } },
        },
      }),
      this.prisma.userProfile.count({ where }),
    ]);

    const items = rows.map((r) => ({
      userId: r.userId,
      email: r.user?.email ?? '',
      status: this.toApiStatus(r.verificationStatus),
      submittedAt: r.verificationSubmittedAt
        ? r.verificationSubmittedAt.toISOString()
        : null,
      reviewedAt: r.verificationReviewedAt
        ? r.verificationReviewedAt.toISOString()
        : null,
      reviewedBy: r.verificationReviewedBy ?? null,
      notes: r.verificationNotes ?? null,
      createdAt: r.createdAt.toISOString(),
      professionalProfile:
        r.professionalProfile &&
        typeof r.professionalProfile === 'object' &&
        !Array.isArray(r.professionalProfile)
          ? (r.professionalProfile as Record<string, unknown>)
          : {},
    }));

    return { items, page, pageSize, total };
  }

  async approveProfessional(targetUserId: string, adminUserId: string) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId: targetUserId },
    });
    if (!profile) {
      throw new NotFoundException('Professional profile not found.');
    }
    if (profile.role !== OnboardingUserRole.professional) {
      throw new BadRequestException(
        'This account is not a professional account.',
      );
    }

    const fees = readBothConsultationFeesMajor(profile.professionalProfile);
    if (fees.video <= 0 || fees.written <= 0) {
      throw new BadRequestException(
        'This professional must set positive video and written consultation fees (whole ETB) in their public profile before they can be approved.',
      );
    }

    await this.prisma.userProfile.update({
      where: { userId: targetUserId },
      data: {
        verificationStatus: ProfessionalVerificationStatus.verified,
        verificationReviewedAt: new Date(),
        verificationReviewedBy: adminUserId,
        verificationNotes: null,
      },
    });

    return { ok: true };
  }

  async rejectProfessional(
    targetUserId: string,
    adminUserId: string,
    notes: string,
  ) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId: targetUserId },
    });
    if (!profile) {
      throw new NotFoundException('Professional profile not found.');
    }
    if (profile.role !== OnboardingUserRole.professional) {
      throw new BadRequestException(
        'This account is not a professional account.',
      );
    }

    await this.prisma.userProfile.update({
      where: { userId: targetUserId },
      data: {
        verificationStatus: ProfessionalVerificationStatus.rejected,
        verificationReviewedAt: new Date(),
        verificationReviewedBy: adminUserId,
        verificationNotes: notes.trim().slice(0, 2000),
        // Keep submittedAt as a record of *when* they applied; the doctor
        // re-submit flow will overwrite it with a fresh timestamp.
      },
    });

    return { ok: true };
  }

  private toApiStatus(
    s: ProfessionalVerificationStatus | null,
  ): AdminVerificationStatus {
    switch (s) {
      case ProfessionalVerificationStatus.verified:
        return 'verified';
      case ProfessionalVerificationStatus.rejected:
        return 'rejected';
      case ProfessionalVerificationStatus.pending:
      default:
        return 'pending';
    }
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
    const now = new Date();
    const currency =
      this.config.get<string>('CHAPA_CURRENCY')?.toUpperCase() ?? 'ETB';

    const [
      assistantRevenue,
      consultationRevenue,
      activeAccessRows,
      assistantTransactions,
      consultationTransactions,
    ] = await this.prisma.$transaction([
      this.prisma.userAssistantAccess.aggregate({
        _sum: { amountCents: true },
        where: { paidAt: { not: null } },
      }),
      this.prisma.consultationBooking.aggregate({
        _sum: { consultationFeeCents: true },
        where: { paidAt: { not: null } },
      }),
      this.prisma.userAssistantAccess.findMany({
        where: {
          status: 'active',
          endsAt: { gt: now },
        },
        select: { userId: true, amountCents: true },
      }),
      this.prisma.userAssistantAccess.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          user: { select: { email: true } },
          plan: { select: { name: true } },
        },
      }),
      this.prisma.consultationBooking.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          patient: { select: { email: true } },
          topDoctor: {
            select: {
              email: true,
              profile: {
                select: {
                  preferredName: true,
                  professionalProfile: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const totalRevenueCents =
      (assistantRevenue._sum.amountCents ?? 0) +
      (consultationRevenue._sum.consultationFeeCents ?? 0);
    const activeSubscriptions = new Set(activeAccessRows.map((row) => row.userId))
      .size;
    const monthlyRecurringRevenueCents = activeAccessRows.reduce(
      (sum, row) => sum + row.amountCents,
      0,
    );

    const transactions = [
      ...assistantTransactions.map((row) => ({
        id: row.id,
        userEmail: row.user.email,
        planName: row.plan.name,
        amountCents: row.amountCents,
        amountDisplay: formatPaymentPrice(row.amountCents, row.currency),
        currency: row.currency,
        status:
          row.status === 'active'
            ? ('completed' as const)
            : row.status === 'pending'
              ? ('pending' as const)
              : ('failed' as const),
        createdAt: row.createdAt.toISOString(),
      })),
      ...consultationTransactions.map((row) => ({
        id: row.id,
        userEmail: row.patient.email,
        planName: `Consultation: ${doctorName(row.topDoctor)} (${row.consultationType})`,
        amountCents: row.consultationFeeCents,
        amountDisplay: formatPaymentPrice(
          row.consultationFeeCents,
          row.currency,
        ),
        currency: row.currency,
        status:
          row.status === 'confirmed' || row.status === 'paid'
            ? ('completed' as const)
            : row.status === 'pending_payment'
              ? ('pending' as const)
              : ('failed' as const),
        createdAt: row.createdAt.toISOString(),
      })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return {
      totalRevenueCents,
      totalRevenueDisplay: formatPaymentPrice(totalRevenueCents, currency),
      currency,
      activeSubscriptions,
      monthlyRecurringRevenueCents,
      monthlyRecurringRevenueDisplay: formatPaymentPrice(
        monthlyRecurringRevenueCents,
        currency,
      ),
      churnRatePercent: null,
      paymentProviderConnected: Boolean(
        this.config.get<string>('CHAPA_SECRET_KEY'),
      ),
      transactions: transactions.slice(0, 12),
    };
  }
}

function doctorName(doctor: {
  email: string;
  profile: {
    preferredName: string;
    professionalProfile: unknown;
  } | null;
}): string {
  if (
    doctor.profile?.professionalProfile &&
    typeof doctor.profile.professionalProfile === 'object' &&
    !Array.isArray(doctor.profile.professionalProfile)
  ) {
    const fullName = (doctor.profile.professionalProfile as Record<string, unknown>)
      .fullName;
    if (typeof fullName === 'string' && fullName.trim() !== '') {
      return fullName.trim();
    }
  }
  return doctor.profile?.preferredName ?? doctor.email;
}
