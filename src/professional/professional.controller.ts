import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { ListPatientsQueryDto } from './dto/list-patients-query.dto';
import { ListPatientsResponseDto } from './dto/patient-summary.dto';
import { PatientDetailDto } from './dto/patient-detail.dto';
import {
  clampMessageLimit,
  ListPatientMessagesQueryDto,
} from './dto/list-patient-messages-query.dto';
import {
  PatientMessageDto,
  PatientMessageThreadDto,
} from './dto/patient-message-response.dto';
import { PostPatientMessageDto } from './dto/post-patient-message.dto';
import { ProfessionalService } from './professional.service';
import { PatchMeProfileDto } from '../me/dto/patch-me-profile.dto';
import { MedicalHistoryDataDto } from '../me/dto/medical-history-data.dto';
import { auditContextFromRequest } from '../me/audit-request.util';

@ApiTags('professional')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('professional')
export class ProfessionalController {
  constructor(private readonly svc: ProfessionalService) {}

  @Get('patients')
  @ApiOperation({
    summary:
      'List registered patients (personal-role users) for the calling doctor',
    description:
      'Returns all users with `UserProfile.role === personal` (excluding the caller). Caller must be `professional`. Supports paging and free-text search by name/email.',
  })
  @ApiResponse({ status: 200, type: ListPatientsResponseDto })
  @ApiResponse({
    status: 403,
    description: 'Caller is not a professional user',
  })
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  listPatients(
    @CurrentUser() user: RequestUser,
    @Query() query: ListPatientsQueryDto,
  ): Promise<ListPatientsResponseDto> {
    return this.svc.listPatients(user.id, query);
  }

  @Get('patients/:patientId')
  @ApiOperation({
    summary:
      'Fetch a single patient with their dashboard profile and medical history',
  })
  @ApiParam({ name: 'patientId', description: 'Patient User.id (UUID)' })
  @ApiResponse({ status: 200, type: PatientDetailDto })
  @ApiResponse({
    status: 403,
    description: 'Caller is not a professional user',
  })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  getPatient(
    @CurrentUser() user: RequestUser,
    @Param('patientId') patientId: string,
  ): Promise<PatientDetailDto> {
    return this.svc.getPatient(user.id, patientId);
  }

  @Patch('patients/:patientId/profile')
  @ApiOperation({
    summary:
      "Update fields on a patient's UserProfile (doctor-side; identity-only fields like preferredFeature/professionalProfile are stripped server-side)",
  })
  @ApiParam({ name: 'patientId', description: 'Patient User.id (UUID)' })
  @ApiResponse({ status: 200, type: PatientDetailDto })
  @ApiResponse({ status: 400, description: 'Invalid patch body' })
  @ApiResponse({
    status: 403,
    description: 'Caller is not a professional user',
  })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  patchPatientProfile(
    @CurrentUser() user: RequestUser,
    @Param('patientId') patientId: string,
    @Body() dto: PatchMeProfileDto,
    @Req() req: Request,
  ): Promise<PatientDetailDto> {
    return this.svc.patchPatientProfile(
      user.id,
      patientId,
      dto,
      auditContextFromRequest(req),
    );
  }

  @Put('patients/:patientId/medical-history')
  @ApiOperation({
    summary: "Replace a patient's medical history JSON (doctor-side)",
  })
  @ApiParam({ name: 'patientId', description: 'Patient User.id (UUID)' })
  @ApiResponse({ status: 200, type: PatientDetailDto })
  @ApiResponse({ status: 400, description: 'Invalid medical-history body' })
  @ApiResponse({
    status: 403,
    description: 'Caller is not a professional user',
  })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  putPatientMedicalHistory(
    @CurrentUser() user: RequestUser,
    @Param('patientId') patientId: string,
    @Body() body: MedicalHistoryDataDto,
    @Req() req: Request,
  ): Promise<PatientDetailDto> {
    return this.svc.putPatientMedicalHistory(
      user.id,
      patientId,
      body,
      auditContextFromRequest(req),
    );
  }

  @Get('patients/:patientId/messages')
  @ApiOperation({
    summary:
      'List messages in the doctor↔patient thread (creates the thread on first call)',
    description:
      'Inbound (patient → doctor) messages are marked as read as a side-effect of this call.',
  })
  @ApiParam({ name: 'patientId', description: 'Patient User.id (UUID)' })
  @ApiResponse({ status: 200, type: PatientMessageThreadDto })
  @ApiResponse({
    status: 403,
    description: 'Caller is not a professional user',
  })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  listMessages(
    @CurrentUser() user: RequestUser,
    @Param('patientId') patientId: string,
    @Query() query: ListPatientMessagesQueryDto,
  ): Promise<PatientMessageThreadDto> {
    return this.svc.listMessages(
      user.id,
      patientId,
      clampMessageLimit(query.limit),
    );
  }

  @Post('patients/:patientId/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send a doctor → patient message in the thread' })
  @ApiParam({ name: 'patientId', description: 'Patient User.id (UUID)' })
  @ApiResponse({ status: 201, type: PatientMessageDto })
  @ApiResponse({ status: 400, description: 'Invalid body' })
  @ApiResponse({
    status: 403,
    description: 'Caller is not a professional user',
  })
  @ApiResponse({ status: 404, description: 'Patient not found' })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  sendMessage(
    @CurrentUser() user: RequestUser,
    @Param('patientId') patientId: string,
    @Body() dto: PostPatientMessageDto,
  ): Promise<PatientMessageDto> {
    return this.svc.sendMessage(user.id, patientId, dto.body);
  }
}
