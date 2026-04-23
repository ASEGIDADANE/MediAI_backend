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

  @ApiProperty({ description: 'User has completed onboarding (UserProfile row exists)' })
  hasProfile: boolean;

  @ApiProperty({
    required: false,
    enum: ['personal', 'professional'],
    nullable: true,
    description: 'Onboarding role when `hasProfile` is true',
  })
  profileRole: 'personal' | 'professional' | null;
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
