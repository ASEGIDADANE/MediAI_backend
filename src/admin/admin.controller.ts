import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserAppRole } from '../generated/prisma/client';
import { CurrentUser, type RequestUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminService } from './admin.service';
import { AdminRecentActivityQueryDto } from './dto/admin-recent-activity-query.dto';
import { AdminSupportReportsQueryDto } from './dto/admin-support-reports-query.dto';
import { AdminUsersQueryDto } from './dto/admin-users-query.dto';
import {
  AdminBillingSummaryResponseDto,
  AdminPaginatedSupportReportsResponseDto,
  AdminPaginatedUsersResponseDto,
  AdminRecentActivityResponseDto,
  AdminSummaryResponseDto,
} from './dto/admin-response.dtos';

@ApiTags('admin')
@Controller('admin')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserAppRole.admin)
@ApiBearerAuth('access-token')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  @ApiOperation({
    summary: 'List users (paginated, safe fields)',
    description:
      'Requires `appRole=admin`. Optional `q` filters email (contains, case-insensitive, max 120 chars).',
  })
  @ApiResponse({ status: 200, type: AdminPaginatedUsersResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'Not an admin' })
  async listUsers(
    @CurrentUser() _admin: RequestUser,
    @Query() q: AdminUsersQueryDto,
  ): Promise<AdminPaginatedUsersResponseDto> {
    return this.admin.listUsers(q);
  }

  @Get('support-reports')
  @ApiOperation({
    summary: 'List support / report-issue submissions',
    description:
      'Message is returned as `messagePreview` (max 500 chars). Optional `userId` filters by submitter.',
  })
  @ApiResponse({ status: 200, type: AdminPaginatedSupportReportsResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'Not an admin' })
  async listSupportReports(
    @CurrentUser() _admin: RequestUser,
    @Query() q: AdminSupportReportsQueryDto,
  ): Promise<AdminPaginatedSupportReportsResponseDto> {
    return this.admin.listSupportReports(q);
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Real aggregate counts from the database',
    description:
      'Use with `GET /api/admin/config` for static dashboard shell (stat cards, etc.); this endpoint is the **live** summary (Option A in docs).',
  })
  @ApiResponse({ status: 200, type: AdminSummaryResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'Not an admin' })
  async summary(
    @CurrentUser() _admin: RequestUser,
  ): Promise<AdminSummaryResponseDto> {
    return this.admin.getSummary();
  }

  @Get('recent-activity')
  @ApiOperation({
    summary: 'Merged recent-activity feed for the admin dashboard',
    description:
      'Combines signups, AccountAuditLog rows (profile/medical/AI-doctor changes, exports, deletes) and support reports into a single PHI-free list, sorted newest first.',
  })
  @ApiResponse({ status: 200, type: AdminRecentActivityResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'Not an admin' })
  async recentActivity(
    @CurrentUser() _admin: RequestUser,
    @Query() q: AdminRecentActivityQueryDto,
  ): Promise<AdminRecentActivityResponseDto> {
    return this.admin.getRecentActivity({ limit: q.limit });
  }

  @Get('billing-summary')
  @ApiOperation({
    summary: 'Live billing snapshot used by /admin/subscriptions',
    description:
      'Replaces the legacy mocked `revenueSummary` + `transactions`. Until a payment provider is integrated `totalRevenueCents` is 0, `transactions` is empty, and `paymentProviderConnected` is `false`.',
  })
  @ApiResponse({ status: 200, type: AdminBillingSummaryResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'Not an admin' })
  async billingSummary(
    @CurrentUser() _admin: RequestUser,
  ): Promise<AdminBillingSummaryResponseDto> {
    return this.admin.getBillingSummary();
  }
}
