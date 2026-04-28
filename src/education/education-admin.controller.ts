import {
  Body,
  Controller,
  Delete,
  Get,
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
import { CurrentUser, type RequestUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  CreateEducationResourceBodyDto,
  PatchEducationResourceBodyDto,
} from './dto/admin-education-resource-body.dto';
import {
  EducationResourceResponseDto,
  EducationResourcesListResponseDto,
} from './dto/education-resource-response.dto';
import { EducationService } from './education.service';

@ApiTags('admin')
@Controller('admin/education/resources')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserAppRole.admin)
@ApiBearerAuth('access-token')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class EducationAdminController {
  constructor(private readonly education: EducationService) {}

  @Get()
  @ApiOperation({ summary: 'List all education resources (including unpublished)' })
  @ApiResponse({ status: 200, type: EducationResourcesListResponseDto })
  listAll(@CurrentUser() _a: RequestUser): Promise<EducationResourcesListResponseDto> {
    return this.education.listAllForAdmin();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create education resource' })
  @ApiResponse({ status: 201, type: EducationResourceResponseDto })
  @ApiResponse({ status: 409, description: 'Duplicate slug' })
  create(
    @CurrentUser() _a: RequestUser,
    @Body() body: CreateEducationResourceBodyDto,
  ): Promise<EducationResourceResponseDto> {
    return this.education.createByAdmin(body);
  }

  @Patch(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: EducationResourceResponseDto })
  @ApiResponse({ status: 404, description: 'Not found' })
  @ApiResponse({ status: 409, description: 'Slug conflict' })
  patch(
    @CurrentUser() _a: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: PatchEducationResourceBodyDto,
  ): Promise<EducationResourceResponseDto> {
    return this.education.patchByAdmin(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Soft-deleted' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async remove(
    @CurrentUser() _a: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    await this.education.softDeleteByAdmin(id);
  }
}
