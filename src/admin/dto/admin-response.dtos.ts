import { ApiProperty } from '@nestjs/swagger';
import { UserAppRole } from '../../generated/prisma/client';

export class AdminUserListItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ enum: UserAppRole })
  appRole: UserAppRole;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;

  @ApiProperty({
    description: 'User has completed onboarding (UserProfile row exists)',
  })
  hasProfile: boolean;

  @ApiProperty({
    required: false,
    enum: ['personal', 'professional'],
    nullable: true,
    description: 'Onboarding role when `hasProfile` is true',
  })
  profileRole: 'personal' | 'professional' | null;

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'Display name from UserProfile when `hasProfile` is true.',
  })
  preferredName: string | null;

  @ApiProperty({
    required: false,
    nullable: true,
    description:
      'Specialty (extracted from `professionalProfile.specialty`) when the user is a professional.',
  })
  specialty: string | null;
}

export class AdminPaginatedUsersResponseDto {
  @ApiProperty({ type: [AdminUserListItemDto] })
  items: AdminUserListItemDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;

  @ApiProperty()
  total: number;
}

export class AdminSupportReportListItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ nullable: true })
  userId: string | null;

  @ApiProperty({ description: 'Up to 500 characters' })
  messagePreview: string;

  @ApiProperty()
  createdAt: string;
}

export class AdminPaginatedSupportReportsResponseDto {
  @ApiProperty({ type: [AdminSupportReportListItemDto] })
  items: AdminSupportReportListItemDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;

  @ApiProperty()
  total: number;
}

export type AdminActivityType =
  | 'signup'
  | 'profile_update'
  | 'medical_history_update'
  | 'ai_doctor_setup'
  | 'data_export'
  | 'account_delete'
  | 'support_report';

export class AdminActivityItemDto {
  @ApiProperty({
    description: 'Synthetic id like `signup_<userId>` or `audit_<logId>`',
  })
  id: string;

  @ApiProperty({
    enum: [
      'signup',
      'profile_update',
      'medical_history_update',
      'ai_doctor_setup',
      'data_export',
      'account_delete',
      'support_report',
    ],
  })
  type: AdminActivityType;

  @ApiProperty({ description: 'Human-readable summary; never PHI' })
  description: string;

  @ApiProperty({ description: 'ISO 8601 timestamp of the underlying event' })
  createdAt: string;
}

export class AdminRecentActivityResponseDto {
  @ApiProperty({ type: [AdminActivityItemDto] })
  items: AdminActivityItemDto[];
}

export class AdminSummaryResponseDto {
  @ApiProperty()
  userCount: number;

  @ApiProperty({ description: 'Users with a UserProfile row' })
  profileCount: number;

  @ApiProperty()
  supportReportCount: number;

  @ApiProperty()
  adminCount: number;

  @ApiProperty({ description: 'Users created in the last 24 hours' })
  last24hRegistrations: number;
}

/* -------------------------------------------------------------------------- */
/*  Professional (doctor) verifications                                       */
/* -------------------------------------------------------------------------- */

export type AdminVerificationStatus = 'pending' | 'verified' | 'rejected';

export class AdminProfessionalVerificationItemDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ enum: ['pending', 'verified', 'rejected'] })
  status: AdminVerificationStatus;

  @ApiProperty({ nullable: true, description: 'ISO 8601' })
  submittedAt: string | null;

  @ApiProperty({ nullable: true, description: 'ISO 8601' })
  reviewedAt: string | null;

  @ApiProperty({ nullable: true })
  reviewedBy: string | null;

  @ApiProperty({ nullable: true })
  notes: string | null;

  @ApiProperty({ description: 'When the user account was created (ISO 8601)' })
  createdAt: string;

  @ApiProperty({
    description:
      'Full `professionalProfile` JSON so the admin can read the bio / experience / etc. without a second round-trip.',
    type: 'object',
    additionalProperties: true,
  })
  professionalProfile: Record<string, unknown>;
}

export class AdminProfessionalVerificationsResponseDto {
  @ApiProperty({ type: [AdminProfessionalVerificationItemDto] })
  items: AdminProfessionalVerificationItemDto[];

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;

  @ApiProperty()
  total: number;
}

/* -------------------------------------------------------------------------- */
/*  Billing summary                                                            */
/* -------------------------------------------------------------------------- */

export class AdminBillingTransactionDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ description: 'Email of the paying user (when known)' })
  userEmail: string;

  @ApiProperty()
  planName: string;

  @ApiProperty({
    description: 'Amount in the transaction currency, minor units (cents)',
  })
  amountCents: number;

  @ApiProperty()
  amountDisplay: string;

  @ApiProperty()
  currency: string;

  @ApiProperty({ enum: ['completed', 'pending', 'failed'] })
  status: 'completed' | 'pending' | 'failed';

  @ApiProperty({ description: 'ISO 8601 timestamp' })
  createdAt: string;
}

/**
 * Real (non-mocked) billing snapshot used by `/admin/subscriptions`. Until a
 * payment provider is integrated `totalRevenueCents` and `transactions` are
 * always 0 / `[]`. `activeSubscriptions` is the live non-admin user count
 * (everyone is on the free tier today). The frontend uses
 * `paymentProviderConnected` to decide whether to show "Connect a payment
 * provider…" hints.
 */
export class AdminBillingSummaryResponseDto {
  @ApiProperty({
    description: 'Always 0 until a payment provider is connected',
  })
  totalRevenueCents: number;

  @ApiProperty({ example: '$0.00' })
  totalRevenueDisplay: string;

  @ApiProperty({ example: 'USD' })
  currency: string;

  @ApiProperty({
    description:
      'Live non-admin user count. Once billing is connected this should be replaced with the count of users on a paid tier.',
  })
  activeSubscriptions: number;

  @ApiProperty({
    description: 'Always 0 until a payment provider is connected',
  })
  monthlyRecurringRevenueCents: number;

  @ApiProperty({ example: '$0.00' })
  monthlyRecurringRevenueDisplay: string;

  @ApiProperty({
    nullable: true,
    description: 'Null until enough churn data exists to compute a percentage.',
  })
  churnRatePercent: number | null;

  @ApiProperty({
    description:
      'False until a payment provider (Stripe, Paddle, etc.) has been integrated. The UI uses this to decide whether to show a "no transactions yet" empty state.',
  })
  paymentProviderConnected: boolean;

  @ApiProperty({ type: [AdminBillingTransactionDto] })
  transactions: AdminBillingTransactionDto[];
}
