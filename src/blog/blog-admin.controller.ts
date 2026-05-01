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
  Put,
  Query,
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
import { BlogAdminArticlesQueryDto } from './dto/blog-admin-articles-query.dto';
import {
  BlogArticleAdminResponseDto,
  BlogArticlesAdminListResponseDto,
  BlogHomeResponseDto,
} from './dto/blog-article-response.dto';
import { BlogService } from './blog.service';

/**
 * Blog CMS API: JWT + `appRole === admin` only.
 * `GET articles` / `GET articles/:id` return drafts and unpublished rows for full in-app editing.
 */
@ApiTags('admin')
@Controller('admin/blog')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserAppRole.admin)
@ApiBearerAuth('access-token')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class BlogAdminController {
  constructor(private readonly blog: BlogService) {}

  @Get('articles')
  @ApiOperation({
    summary: 'List articles (admin)',
    description: 'Includes drafts and soft-deleted (unpublished) rows. Use `published` query to filter.',
  })
  @ApiResponse({ status: 200, type: BlogArticlesAdminListResponseDto })
  listAdmin(
    @CurrentUser() _a: RequestUser,
    @Query() query: BlogAdminArticlesQueryDto,
  ): Promise<BlogArticlesAdminListResponseDto> {
    return this.blog.listArticlesAdmin(query);
  }

  @Get('articles/:id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOperation({ summary: 'Get one article (admin, any publication state)' })
  @ApiResponse({ status: 200, type: BlogArticleAdminResponseDto })
  @ApiResponse({ status: 404, description: 'Not found' })
  getOneAdmin(
    @CurrentUser() _a: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<BlogArticleAdminResponseDto> {
    return this.blog.getByIdAdmin(id);
  }

  @Post('articles')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create blog article' })
  @ApiResponse({ status: 201, type: BlogArticleAdminResponseDto })
  create(
    @CurrentUser() _a: RequestUser,
    @Body() body: CreateBlogArticleBodyDto,
  ): Promise<BlogArticleAdminResponseDto> {
    return this.blog.createByAdmin(body);
  }

  @Patch('articles/:id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: BlogArticleAdminResponseDto })
  @ApiResponse({ status: 404, description: 'Not found' })
  patch(
    @CurrentUser() _a: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: PatchBlogArticleBodyDto,
  ): Promise<BlogArticleAdminResponseDto> {
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
