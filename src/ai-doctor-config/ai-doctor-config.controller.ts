import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AiDoctorConfigService } from './ai-doctor-config.service';

@ApiTags('ai-doctor')
@Controller('ai-doctor')
export class AiDoctorConfigController {
  constructor(private readonly service: AiDoctorConfigService) {}

  @Get('config')
  @ApiOperation({
    summary: 'AI Doctor wizard steps (GET /api/ai-doctor/config)',
  })
  getConfig() {
    return this.service.getConfig();
  }
}
