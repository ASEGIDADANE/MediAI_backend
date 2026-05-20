import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SubscriptionStatus, UserAppRole } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSubscriptionPlanBodyDto,
  PatchSubscriptionPlanBodyDto,
} from './dto/admin-subscription-plan-body.dto';
import {
  toSubscriptionPlanAdminDto,
  toSubscriptionPlanDto,
} from './subscription-plan.mapper';

const FREE_PLAN_NAMES = new Set(['free']);

@Injectable()
export class SubscriptionPlansService {
  constructor(private readonly prisma: PrismaService) {}

  /** Public read: only `active` plans, ordered by `sortOrder` then name. */
  async listPublic() {
    const rows = await this.prisma.subscriptionPlan.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return { items: rows.map(toSubscriptionPlanDto) };
  }

  /**
   * Admin read: every plan (including inactive) plus a `subscriberCount`.
   *
   * Phase 7 — `UserSubscription` now tracks per-user subscriptions, so paid
   * tiers report a real count of distinct users with an `active` row whose
   * `endsAt` is still in the future. The "Free" tier keeps its previous
   * "every patient is on Free" interpretation (we count non-admin users
   * rather than `UserSubscription` rows because users don't have to click
   * anything to "be on Free").
   */
  async listAdmin() {
    const rows = await this.prisma.subscriptionPlan.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const items = await Promise.all(
      rows.map(async (row) => {
        const count = await this.subscriberCountForPlan(row);
        return toSubscriptionPlanAdminDto(row, count);
      }),
    );
    return { items };
  }

  async getByIdAdmin(id: string) {
    const row = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException('Plan not found');
    }
    return toSubscriptionPlanAdminDto(
      row,
      await this.subscriberCountForPlan(row),
    );
  }

  /**
   * "Free" → every non-admin user (since Free is the implicit default).
   * Anything else → distinct users with an active, non-expired
   * `UserSubscription` row for this plan.
   */
  private async subscriberCountForPlan(plan: {
    id: string;
    name: string;
  }): Promise<number> {
    const isFree = FREE_PLAN_NAMES.has(plan.name.trim().toLowerCase());
    if (isFree) {
      return this.prisma.user.count({ where: { appRole: UserAppRole.user } });
    }
    const grouped = await this.prisma.userSubscription.findMany({
      where: {
        planId: plan.id,
        status: SubscriptionStatus.active,
        endsAt: { gt: new Date() },
      },
      select: { userId: true },
      distinct: ['userId'],
    });
    return grouped.length;
  }

  async create(dto: CreateSubscriptionPlanBodyDto) {
    const data: Prisma.SubscriptionPlanCreateInput = {
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      monthlyPriceCents: dto.monthlyPriceCents,
      yearlyPriceCents: dto.yearlyPriceCents,
      currency: (dto.currency ?? 'USD').toUpperCase(),
      features: (dto.features ?? []) as Prisma.InputJsonValue,
      active: dto.active ?? true,
      sortOrder: dto.sortOrder ?? 0,
    };

    try {
      const row = await this.prisma.subscriptionPlan.create({ data });
      return toSubscriptionPlanAdminDto(row, 0);
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          `A plan named "${data.name}" already exists.`,
        );
      }
      throw e;
    }
  }

  async patch(id: string, dto: PatchSubscriptionPlanBodyDto) {
    // Fail fast with a clear 404 instead of relying on the P2025 thrown by
    // `update` — saves us from string-matching error codes downstream.
    const existing = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Plan not found');
    }

    const data: Prisma.SubscriptionPlanUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.description !== undefined) {
      data.description = dto.description?.trim() || null;
    }
    if (dto.monthlyPriceCents !== undefined) {
      data.monthlyPriceCents = dto.monthlyPriceCents;
    }
    if (dto.yearlyPriceCents !== undefined) {
      data.yearlyPriceCents = dto.yearlyPriceCents;
    }
    if (dto.currency !== undefined) data.currency = dto.currency.toUpperCase();
    if (dto.features !== undefined) {
      data.features = dto.features as Prisma.InputJsonValue;
    }
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    try {
      const row = await this.prisma.subscriptionPlan.update({
        where: { id },
        data,
      });
      return toSubscriptionPlanAdminDto(
        row,
        await this.subscriberCountForPlan(row),
      );
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException(
          `A plan named "${data.name as string}" already exists.`,
        );
      }
      throw e;
    }
  }

  async delete(id: string) {
    const existing = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Plan not found');
    }
    await this.prisma.subscriptionPlan.delete({ where: { id } });
  }
}
