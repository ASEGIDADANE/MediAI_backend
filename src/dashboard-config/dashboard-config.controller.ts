import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DashboardConfigService } from './dashboard-config.service';

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardConfigController {
  constructor(private readonly config: DashboardConfigService) {}

  @Get('config')
  @ApiOperation({
    summary:
      'Dashboard home cards & defaults (MediAI GET /api/dashboard/config)',
  })
  @ApiResponse({ status: 200 })
  getConfig() {
    return this.config.getConfig();
  }
}
