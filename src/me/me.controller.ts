import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Patch,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { Response } from 'express';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { auditContextFromRequest } from './audit-request.util';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { PatchAiDoctorSetupDto } from './dto/ai-doctor-setup.dto';
import { GetMeProfileResponseDto } from './dto/get-me-profile-response.dto';
import { MedicalHistoryDataDto } from './dto/medical-history-data.dto';
import { PatchMeProfileDto } from './dto/patch-me-profile.dto';
import { MeService } from './me.service';
import { MeTrustService } from './me-trust.service';

@ApiTags('me')
@Controller('me')
export class MeController {
  private readonly log = new Logger(MeController.name);

  constructor(
    private readonly me: MeService,
    private readonly trust: MeTrustService,
  ) {}

  @Get('profile')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Current user profile, medical history, and AI doctor setup flag',
    description:
      'Returns 200 with `profile: null` if onboarding was never completed; otherwise `profile` matches MediAI `DashboardProfile` (string `age`, merged `professionalProfile` JSON).',
  })
  @ApiResponse({ status: 200, type: GetMeProfileResponseDto })
  getProfile(
    @CurrentUser() user: RequestUser,
  ): Promise<GetMeProfileResponseDto> {
    return this.me.getMe(user.id);
  }

  @Get('export')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('access-token')
  @Throttle({ default: { limit: 3, ttl: 3_600_000 } })
  @ApiOperation({
    summary: 'Download all data tied to the account (JSON attachment)',
    description:
      'Trust / compliance export. Throttled. If the JSON would exceed `ME_EXPORT_MAX_BYTES`, returns 413.',
  })
  @ApiResponse({ status: 200, description: 'application/json attachment' })
  @ApiResponse({ status: 401, description: 'Invalid JWT' })
  @ApiResponse({ status: 413, description: 'Export too large' })
  @ApiResponse({ status: 429, description: 'Too many export requests' })
  async exportData(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { body, filename, byteLength } = await this.trust.buildExport(
      user.id,
    );
    this.log.log(
      JSON.stringify({
        event: 'data_export',
        userId: user.id,
        byteLength,
      }),
    );
    await this.trust.logExportAudit(
      user.id,
      byteLength,
      auditContextFromRequest(req),
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return body;
  }

  @Delete('account')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('access-token')
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @ApiOperation({
    summary: 'Delete account and user-owned data (irreversible)',
    description:
      'Email/password users must send `password`. Google-only users must send `{ "confirm": "DELETE" }`. Support tickets for this user are removed. JWT remains valid until expiry.',
  })
  @ApiBody({ type: DeleteAccountDto })
  @ApiResponse({ status: 204, description: 'Account deleted' })
  @ApiResponse({ status: 400, description: 'Missing password or confirm' })
  @ApiResponse({ status: 401, description: 'Wrong password' })
  async deleteAccount(
    @CurrentUser() user: RequestUser,
    @Body() dto: DeleteAccountDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.trust.deleteAccount(
      user.id,
      user.email,
      dto,
      auditContextFromRequest(req),
    );
  }

  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('access-token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Partially update dashboard profile and/or professional profile JSON',
    description:
      'Merge semantics. Requires an existing `UserProfile` (onboarding completed). Does not change `role` (use onboarding rules). `professionalProfile` is shallow-merged with the stored object.',
  })
  @ApiResponse({ status: 200, type: GetMeProfileResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Validation or height system mismatch',
  })
  @ApiResponse({
    status: 404,
    description: 'No UserProfile — complete onboarding first',
  })
  patchProfile(
    @CurrentUser() user: RequestUser,
    @Body() dto: PatchMeProfileDto,
    @Req() req: Request,
  ): Promise<GetMeProfileResponseDto> {
    return this.me.patchProfile(user.id, dto, auditContextFromRequest(req));
  }

  @Put('medical-history')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('access-token')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Replace medical history (MediAI MedicalHistoryData shape)',
    description:
      'PUT replaces the full JSON document; send empty strings/arrays for unused fields as in the frontend default.',
  })
  @ApiResponse({ status: 200, type: GetMeProfileResponseDto })
  @ApiResponse({ status: 404, description: 'No UserProfile' })
  putMedicalHistory(
    @CurrentUser() user: RequestUser,
    @Body() body: MedicalHistoryDataDto,
    @Req() req: Request,
  ): Promise<GetMeProfileResponseDto> {
    return this.me.putMedicalHistory(
      user.id,
      body,
      auditContextFromRequest(req),
    );
  }

  @Post('professional/submit-verification')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('access-token')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Submit a doctor verification packet for admin review.',
    description:
      'Validates that the merged `professionalProfile` JSON has the required fields (specialty, licenseNumber, yearsOfExperience, bio) and stamps `verificationSubmittedAt = now()`. Idempotent: re-submitting after a rejection clears `reviewedAt` / `notes`.',
  })
  @ApiResponse({ status: 200, type: GetMeProfileResponseDto })
  @ApiResponse({ status: 400, description: 'Missing required fields' })
  @ApiResponse({ status: 409, description: 'Account already verified' })
  submitProfessionalVerification(
    @CurrentUser() user: RequestUser,
  ): Promise<GetMeProfileResponseDto> {
    return this.me.submitVerification(user.id);
  }

  @Patch('ai-doctor/setup')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('access-token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary:
      'Set AI Doctor questionnaire completed flag (replaces localStorage key)',
  })
  @ApiResponse({ status: 200, type: GetMeProfileResponseDto })
  @ApiResponse({ status: 404, description: 'No UserProfile' })
  patchAiDoctorSetup(
    @CurrentUser() user: RequestUser,
    @Body() dto: PatchAiDoctorSetupDto,
    @Req() req: Request,
  ): Promise<GetMeProfileResponseDto> {
    return this.me.patchAiDoctorSetup(
      user.id,
      dto,
      auditContextFromRequest(req),
    );
  }
}
