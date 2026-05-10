import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { OnboardingConfigResponseDto } from './dto/onboarding-config-response.dto';
import { OnboardingStatusDto } from './dto/onboarding-profile-response.dto';
import { OnboardingService } from './onboarding.service';

@ApiTags('onboarding')
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get('config')
  @ApiOperation({
    summary: 'Onboarding wizard copy and option lists',
    description:
      'Public static payload aligned with MediAI `GET /api/onboarding/config` (Next.js) for future cutover.',
  })
  @ApiResponse({ status: 200, type: OnboardingConfigResponseDto })
  getConfig(): OnboardingConfigResponseDto {
    return this.onboarding.getConfig() as OnboardingConfigResponseDto;
  }

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Current user onboarding / profile snapshot',
    description:
      'Returns whether onboarding was persisted and the profile in the same shape as MediAI dashboard localStorage merge.',
  })
  @ApiResponse({ status: 200, type: OnboardingStatusDto })
  getProfile(@CurrentUser() user: RequestUser): Promise<OnboardingStatusDto> {
    return this.onboarding.getStatus(user.id);
  }

  @Post('complete')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('access-token')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Save or update onboarding profile',
    description:
      'Requires JWT. First call sets `role` (immutable afterwards). Re-submissions may refresh health fields but cannot change role.',
  })
  @ApiResponse({ status: 200, type: OnboardingStatusDto })
  @ApiResponse({
    status: 403,
    description: 'Attempt to change role after it was set',
  })
  complete(
    @CurrentUser() user: RequestUser,
    @Body() dto: CompleteOnboardingDto,
  ): Promise<OnboardingStatusDto> {
    return this.onboarding.complete(user.id, dto);
  }
}
