import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  BlogArticleResponseDto,
  BlogArticlesListResponseDto,
  BlogCategoriesResponseDto,
  BlogHomeResponseDto,
} from './dto/blog-article-response.dto';
import { BlogArticlesQueryDto } from './dto/blog-articles-query.dto';
import { BlogService } from './blog.service';

@ApiTags('blog')
@Controller('blog')
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class BlogController {
  constructor(private readonly blog: BlogService) {}

  @Get('home')
  @ApiOperation({
    summary: 'Homepage curation (MediAI featured + section ID lists, UUIDs)',
  })
  @ApiResponse({ status: 200, type: BlogHomeResponseDto })
  getHome(): Promise<BlogHomeResponseDto> {
    return this.blog.getHome();
  }

  @Get('categories')
  @ApiOperation({ summary: 'Distinct categories (published only)' })
  @ApiResponse({ status: 200, type: BlogCategoriesResponseDto })
  getCategories(): Promise<BlogCategoriesResponseDto> {
    return this.blog.listCategories();
  }

  @Get('articles')
  @ApiOperation({
    summary: 'List published articles (paginated)',
    description:
      'Optional `q` searches `title` and `intro` (max 120 chars, case-insensitive).',
  })
  @ApiResponse({ status: 200, type: BlogArticlesListResponseDto })
  list(@Query() q: BlogArticlesQueryDto): Promise<BlogArticlesListResponseDto> {
    return this.blog.listArticles(q);
  }

  @Get('articles/:id')
  @ApiOperation({ summary: 'Get one published article' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: BlogArticleResponseDto })
  @ApiResponse({ status: 404, description: 'Not found or unpublished' })
  getOne(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<BlogArticleResponseDto> {
    return this.blog.getPublicById(id);
  }
}
