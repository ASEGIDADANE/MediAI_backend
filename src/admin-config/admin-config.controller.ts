import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserAppRole } from '../generated/prisma/client';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminConfigService } from './admin-config.service';

@ApiTags('admin')
@Controller('admin')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserAppRole.admin)
@ApiBearerAuth('access-token')
export class AdminConfigController {
  constructor(private readonly service: AdminConfigService) {}

  @Get('config')
  @ApiOperation({
    summary: 'Admin dashboard mock data (GET /api/admin/config)',
    description: 'Requires JWT for a user with appRole=admin',
  })
  @ApiResponse({ status: 200 })
  getConfig() {
    return this.service.getConfig();
  }
}
