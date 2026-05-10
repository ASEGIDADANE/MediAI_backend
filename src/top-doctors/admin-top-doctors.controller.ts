import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
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
  ApiParam,
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
import {
  CreateTopDoctorBodyDto,
  PatchTopDoctorBodyDto,
} from './dto/admin-top-doctor-body.dto';
import { TopDoctorDto } from './dto/top-doctor-response.dto';
import { TopDoctorsService } from './top-doctors.service';

@ApiTags('admin')
@Controller('admin/top-doctors')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserAppRole.admin)
@ApiBearerAuth('access-token')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class AdminTopDoctorsController {
  constructor(private readonly topDoctors: TopDoctorsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a top doctor (admin)' })
  @ApiResponse({ status: 201, type: TopDoctorDto })
  async create(
    @CurrentUser() _admin: RequestUser,
    @Body() body: CreateTopDoctorBodyDto,
  ): Promise<TopDoctorDto> {
    return this.topDoctors.createByAdmin(body);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Partial update (admin). Soft-hide with published: false via body.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: TopDoctorDto })
  @ApiResponse({ status: 404, description: 'Not found' })
  async patch(
    @CurrentUser() _admin: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: PatchTopDoctorBodyDto,
  ): Promise<TopDoctorDto> {
    return this.topDoctors.patchByAdmin(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete: sets published to false' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Soft-deleted' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async remove(
    @CurrentUser() _admin: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    return this.topDoctors.softDeleteByAdmin(id);
  }
}
