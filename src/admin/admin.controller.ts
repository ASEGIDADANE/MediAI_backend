import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserAppRole } from '../generated/prisma/client';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminService } from './admin.service';
import { AdminProfessionalVerificationsQueryDto } from './dto/admin-professional-verifications-query.dto';
import { AdminRecentActivityQueryDto } from './dto/admin-recent-activity-query.dto';
import { AdminRejectVerificationDto } from './dto/admin-reject-verification.dto';
import { AdminSupportReportsQueryDto } from './dto/admin-support-reports-query.dto';
import { AdminUsersQueryDto } from './dto/admin-users-query.dto';
import {
  AdminBillingSummaryResponseDto,
  AdminPaginatedSupportReportsResponseDto,
  AdminPaginatedUsersResponseDto,
  AdminProfessionalVerificationsResponseDto,
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

  @Get('professional-verifications')
  @ApiOperation({
    summary: 'List doctor verification packets (paginated)',
    description:
      'Default `status=awaiting` returns only doctors who clicked Submit and are still pending review (FIFO). Use `status=verified|rejected|pending|all` to inspect history.',
  })
  @ApiResponse({ status: 200, type: AdminProfessionalVerificationsResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'Not an admin' })
  async listProfessionalVerifications(
    @CurrentUser() _admin: RequestUser,
    @Query() q: AdminProfessionalVerificationsQueryDto,
  ): Promise<AdminProfessionalVerificationsResponseDto> {
    return this.admin.listProfessionalVerifications(q);
  }

  @Post('professional-verifications/:userId/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve a doctor — they get full dashboard access immediately.',
  })
  @ApiResponse({ status: 200, schema: { example: { ok: true } } })
  @ApiResponse({ status: 400, description: 'Not a professional account' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async approveProfessional(
    @CurrentUser() admin: RequestUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ): Promise<{ ok: true }> {
    await this.admin.approveProfessional(userId, admin.id);
    return { ok: true };
  }

  @Post('professional-verifications/:userId/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Reject a doctor with a note — they will see the reason and can resubmit.',
  })
  @ApiResponse({ status: 200, schema: { example: { ok: true } } })
  @ApiResponse({ status: 400, description: 'Notes empty / not a professional' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async rejectProfessional(
    @CurrentUser() admin: RequestUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() body: AdminRejectVerificationDto,
  ): Promise<{ ok: true }> {
    await this.admin.rejectProfessional(userId, admin.id, body.notes);
    return { ok: true };
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
