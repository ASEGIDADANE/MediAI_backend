import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  CreateSubscriptionPlanBodyDto,
  PatchSubscriptionPlanBodyDto,
} from './dto/admin-subscription-plan-body.dto';
import {
  SubscriptionPlanAdminListResponseDto,
  SubscriptionPlanAdminResponseDto,
  SubscriptionPlanListResponseDto,
} from './dto/subscription-plan-response.dto';
import { SubscriptionPlansService } from './subscription-plans.service';

/* -------------------------------------------------------------------------- */
/*  Public read                                                                */
/* -------------------------------------------------------------------------- */

@ApiTags('subscription-plans')
@Controller('subscription-plans')
export class SubscriptionPlansPublicController {
  constructor(private readonly service: SubscriptionPlansService) {}

  @Get()
  @ApiOperation({
    summary: 'Public list of active subscription plans (pricing page).',
  })
  @ApiResponse({ status: 200, type: SubscriptionPlanListResponseDto })
  list(): Promise<SubscriptionPlanListResponseDto> {
    return this.service.listPublic();
  }
}

/* -------------------------------------------------------------------------- */
/*  Admin CRUD                                                                 */
/* -------------------------------------------------------------------------- */

@ApiTags('admin')
@Controller('admin/subscription-plans')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserAppRole.admin)
@ApiBearerAuth('access-token')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class SubscriptionPlansAdminController {
  constructor(private readonly service: SubscriptionPlansService) {}

  @Get()
  @ApiOperation({
    summary: 'List every plan (including inactive) for /admin/subscriptions.',
  })
  @ApiResponse({ status: 200, type: SubscriptionPlanAdminListResponseDto })
  list(): Promise<SubscriptionPlanAdminListResponseDto> {
    return this.service.listAdmin();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a single plan by id.' })
  @ApiResponse({ status: 200, type: SubscriptionPlanAdminResponseDto })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  getById(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<SubscriptionPlanAdminResponseDto> {
    return this.service.getByIdAdmin(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new plan.' })
  @ApiResponse({ status: 201, type: SubscriptionPlanAdminResponseDto })
  @ApiResponse({ status: 409, description: 'Plan name already exists' })
  create(
    @Body() body: CreateSubscriptionPlanBodyDto,
  ): Promise<SubscriptionPlanAdminResponseDto> {
    return this.service.create(body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an existing plan.' })
  @ApiResponse({ status: 200, type: SubscriptionPlanAdminResponseDto })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  @ApiResponse({ status: 409, description: 'Plan name already exists' })
  patch(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: PatchSubscriptionPlanBodyDto,
  ): Promise<SubscriptionPlanAdminResponseDto> {
    return this.service.patch(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a plan.' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  async remove(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    await this.service.delete(id);
  }
}
