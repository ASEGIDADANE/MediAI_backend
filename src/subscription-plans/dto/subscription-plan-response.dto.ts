import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Mirrors MediAI `SubscriptionPlanDto`. Cents are exposed alongside a
 * pre-formatted display string so the UI can show prices without re-doing
 * locale/currency formatting on the client.
 */
export class SubscriptionPlanResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'Pro' })
  name!: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  description!: string | null;

  @ApiProperty({ example: 799 })
  monthlyPriceCents!: number;

  @ApiProperty({ example: 9588 })
  yearlyPriceCents!: number;

  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({ example: '$7.99' })
  monthlyPriceDisplay!: string;

  @ApiProperty({ example: '$95.88' })
  yearlyPriceDisplay!: string;

  @ApiProperty({ type: [String], description: 'Free-form bullet copy' })
  features!: string[];

  @ApiProperty({ description: 'When false the tier is hidden from the public pricing page' })
  active!: boolean;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

/**
 * Admin-only — adds the on-platform user counts surfaced on the
 * "Service Plans" panel of `/admin/subscriptions`.
 *
 * `subscriberCount` is computed honestly: until billing is wired the only
 * tier with non-zero subscribers is "Free" (when present), which counts
 * every non-admin user.
 */
export class SubscriptionPlanAdminResponseDto extends SubscriptionPlanResponseDto {
  @ApiProperty({
    description:
      'Live user count attributed to this plan. 0 for paid tiers until a payment provider is integrated; total non-admin user count for the lone "Free" tier when present.',
  })
  subscriberCount!: number;
}

export class SubscriptionPlanListResponseDto {
  @ApiProperty({ type: [SubscriptionPlanResponseDto] })
  items!: SubscriptionPlanResponseDto[];
}

export class SubscriptionPlanAdminListResponseDto {
  @ApiProperty({ type: [SubscriptionPlanAdminResponseDto] })
  items!: SubscriptionPlanAdminResponseDto[];
}
