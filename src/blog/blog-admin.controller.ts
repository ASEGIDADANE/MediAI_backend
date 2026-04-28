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
  Put,
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
  BlogHomeConfigBodyDto,
  CreateBlogArticleBodyDto,
  PatchBlogArticleBodyDto,
} from './dto/admin-blog-article-body.dto';
import { BlogArticleResponseDto, BlogHomeResponseDto } from './dto/blog-article-response.dto';
import { BlogService } from './blog.service';

@ApiTags('admin')
@Controller('admin/blog')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserAppRole.admin)
@ApiBearerAuth('access-token')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class BlogAdminController {
  constructor(private readonly blog: BlogService) {}

  @Post('articles')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create blog article' })
  @ApiResponse({ status: 201, type: BlogArticleResponseDto })
  create(
    @CurrentUser() _a: RequestUser,
    @Body() body: CreateBlogArticleBodyDto,
  ): Promise<BlogArticleResponseDto> {
    return this.blog.createByAdmin(body);
  }

  @Patch('articles/:id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: BlogArticleResponseDto })
  @ApiResponse({ status: 404, description: 'Not found' })
  patch(
    @CurrentUser() _a: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: PatchBlogArticleBodyDto,
  ): Promise<BlogArticleResponseDto> {
    return this.blog.patchByAdmin(id, body);
  }

  @Delete('articles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Soft-deleted' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async remove(
    @CurrentUser() _a: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    await this.blog.softDeleteByAdmin(id);
  }

  @Put('home')
  @ApiOperation({ summary: 'Replace homepage curation (featured + section id lists)' })
  @ApiResponse({ status: 200, type: BlogHomeResponseDto })
  putHome(
    @CurrentUser() _a: RequestUser,
    @Body() body: BlogHomeConfigBodyDto,
  ): Promise<BlogHomeResponseDto> {
    return this.blog.putHomeByAdmin(body);
  }
}
