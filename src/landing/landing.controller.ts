import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LandingService } from './landing.service';

@ApiTags('landing')
@Controller('landing')
export class LandingController {
  constructor(private readonly landing: LandingService) {}

  @Get()
  @ApiOperation({
    summary: 'Public marketing / CMS payload (MediAI GET /api/landing)',
  })
  @ApiResponse({ status: 200, description: 'Landing JSON' })
  get() {
    return this.landing.getLanding();
  }
}
