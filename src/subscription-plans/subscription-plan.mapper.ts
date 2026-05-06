import type { SubscriptionPlan } from '../generated/prisma/client';
import type {
  SubscriptionPlanAdminResponseDto,
  SubscriptionPlanResponseDto,
} from './dto/subscription-plan-response.dto';

/**
 * Formats a minor-units price (cents) for display. Falls back to a plain
 * `<currency> <amount>` string if the runtime `Intl.NumberFormat` cannot
 * format the requested currency (e.g. unknown ISO code).
 */
export function formatPriceCents(cents: number, currency: string): string {
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

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

export function toSubscriptionPlanDto(
  row: SubscriptionPlan,
): SubscriptionPlanResponseDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    monthlyPriceCents: row.monthlyPriceCents,
    yearlyPriceCents: row.yearlyPriceCents,
    currency: row.currency,
    monthlyPriceDisplay: formatPriceCents(row.monthlyPriceCents, row.currency),
    yearlyPriceDisplay: formatPriceCents(row.yearlyPriceCents, row.currency),
    features: asStringArray(row.features),
    active: row.active,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toSubscriptionPlanAdminDto(
  row: SubscriptionPlan,
  subscriberCount: number,
): SubscriptionPlanAdminResponseDto {
  return {
    ...toSubscriptionPlanDto(row),
    subscriberCount,
  };
}
