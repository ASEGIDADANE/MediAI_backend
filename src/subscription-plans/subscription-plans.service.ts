import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserAppRole } from '../generated/prisma/client';
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
   * Admin read: every plan (including inactive) plus a `subscriberCount`
   * computed as honestly as possible without a billing provider:
   *   - "Free" tier (any plan whose lower-cased name is exactly "free"):
   *     non-admin user count (everyone is on the free tier today).
   *   - Every other tier: `0` until billing is integrated.
   *
   * Counting non-admin users (a single COUNT) is cheap and avoids a
   * misleading subscriber count for paid tiers.
   */
  async listAdmin() {
    const [rows, freeUserCount] = await this.prisma.$transaction([
      this.prisma.subscriptionPlan.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.user.count({ where: { appRole: UserAppRole.user } }),
    ]);

    const items = rows.map((row) => {
      const isFree = FREE_PLAN_NAMES.has(row.name.trim().toLowerCase());
      return toSubscriptionPlanAdminDto(row, isFree ? freeUserCount : 0);
    });
    return { items };
  }

  async getByIdAdmin(id: string) {
    const row = await this.prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('Plan not found');
    }
    const isFree = FREE_PLAN_NAMES.has(row.name.trim().toLowerCase());
    const subscriberCount = isFree
      ? await this.prisma.user.count({ where: { appRole: UserAppRole.user } })
      : 0;
    return toSubscriptionPlanAdminDto(row, subscriberCount);
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
      const isFree = FREE_PLAN_NAMES.has(row.name.trim().toLowerCase());
      const subscriberCount = isFree
        ? await this.prisma.user.count({ where: { appRole: UserAppRole.user } })
        : 0;
      return toSubscriptionPlanAdminDto(row, subscriberCount);
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
