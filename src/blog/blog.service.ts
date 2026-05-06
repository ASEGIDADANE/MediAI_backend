import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  BlogHomeConfigBodyDto,
  CreateBlogArticleBodyDto,
  PatchBlogArticleBodyDto,
} from './dto/admin-blog-article-body.dto';
import {
  BlogCategoriesResponseDto,
  BlogHomeResponseDto,
} from './dto/blog-article-response.dto';
import {
  BlogAdminArticlesQueryDto,
  takeSkipBlogAdminArticles,
} from './dto/blog-admin-articles-query.dto';
import { takeSkipBlogArticles, BlogArticlesQueryDto } from './dto/blog-articles-query.dto';
import { toBlogArticleAdminDto, toBlogArticleDto } from './blog.mapper';

@Injectable()
export class BlogService {
  constructor(private readonly prisma: PrismaService) {}

  async listCategories(): Promise<BlogCategoriesResponseDto> {
    const rows = await this.prisma.blogArticle.findMany({
      where: { published: true },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });
    return { categories: rows.map((r) => r.category) };
  }

  async listArticles(dto: BlogArticlesQueryDto) {
    const { take, skip, page, pageSize } = takeSkipBlogArticles(
      dto.page,
      dto.pageSize,
    );
    const category = dto.category?.trim();
    const q = dto.q?.trim().slice(0, 120);

    const where: Prisma.BlogArticleWhereInput = {
      published: true,
      ...(category
        ? { category: { equals: category, mode: 'insensitive' } }
        : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { intro: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.blogArticle.findMany({
        where,
        orderBy: [{ publishedAt: 'desc' }, { title: 'asc' }],
        take,
        skip,
      }),
      this.prisma.blogArticle.count({ where }),
    ]);

    return {
      items: rows.map(toBlogArticleDto),
      page,
      pageSize,
      total,
    };
  }

  async getPublicById(id: string) {
    const row = await this.prisma.blogArticle.findFirst({
      where: { id, published: true },
    });
    if (!row) {
      throw new NotFoundException('Article not found');
    }
    return toBlogArticleDto(row);
  }

  async listArticlesAdmin(dto: BlogAdminArticlesQueryDto) {
    const { take, skip, page, pageSize } = takeSkipBlogAdminArticles(
      dto.page,
      dto.pageSize,
    );
    const category = dto.category?.trim();
    const q = dto.q?.trim().slice(0, 120);
    const published = dto.published ?? 'all';

    const where: Prisma.BlogArticleWhereInput = {
      ...(published === 'all' ? {} : { published: published === 'true' }),
      ...(category
        ? { category: { equals: category, mode: 'insensitive' } }
        : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { intro: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.blogArticle.findMany({
        where,
        orderBy: [{ publishedAt: 'desc' }, { title: 'asc' }],
        take,
        skip,
      }),
      this.prisma.blogArticle.count({ where }),
    ]);

    return {
      items: rows.map(toBlogArticleAdminDto),
      page,
      pageSize,
      total,
    };
  }

  async getByIdAdmin(id: string) {
    const row = await this.prisma.blogArticle.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('Article not found');
    }
    return toBlogArticleAdminDto(row);
  }

  async getHome(): Promise<BlogHomeResponseDto> {
    const row = await this.prisma.blogHomeConfig.findUnique({
      where: { id: 'default' },
    });
    if (!row) {
      return {
        featuredArticleId: null,
        popularArticleIds: [],
        aiHealthcareArticleIds: [],
        secondOpinionArticleIds: [],
        companyNewsArticleIds: [],
      };
    }
    return {
      featuredArticleId: row.featuredArticleId,
      popularArticleIds: asStringArray(row.popularArticleIds),
      aiHealthcareArticleIds: asStringArray(row.aiHealthcareArticleIds),
      secondOpinionArticleIds: asStringArray(row.secondOpinionArticleIds),
      companyNewsArticleIds: asStringArray(row.companyNewsArticleIds),
    };
  }

  private createDataFromDto(d: CreateBlogArticleBodyDto): Prisma.BlogArticleCreateInput {
    return {
      title: d.title,
      category: d.category,
      author: d.author,
      readTime: d.readTime,
      imageSrc: d.imageSrc?.trim() ?? '',
      intro: d.intro,
      sections: JSON.parse(JSON.stringify(d.sections)) as Prisma.InputJsonValue,
      publishedAt: new Date(d.publishedAt),
      dateDisplay: d.dateDisplay ?? null,
      sortOrder: d.sortOrder ?? null,
      published: d.published ?? true,
    };
  }

  async createByAdmin(d: CreateBlogArticleBodyDto) {
    const row = await this.prisma.blogArticle.create({
      data: this.createDataFromDto(d),
    });
    return toBlogArticleAdminDto(row);
  }

  async patchByAdmin(id: string, dto: PatchBlogArticleBodyDto) {
    const existing = await this.prisma.blogArticle.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Article not found');
    }

    const data: Prisma.BlogArticleUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.author !== undefined) data.author = dto.author;
    if (dto.readTime !== undefined) data.readTime = dto.readTime;
    if (dto.imageSrc !== undefined) data.imageSrc = dto.imageSrc.trim();
    if (dto.intro !== undefined) data.intro = dto.intro;
    if (dto.sections !== undefined) {
      data.sections = JSON.parse(
        JSON.stringify(dto.sections),
      ) as Prisma.InputJsonValue;
    }
    if (dto.publishedAt !== undefined) {
      data.publishedAt = new Date(dto.publishedAt);
    }
    if (dto.dateDisplay !== undefined) {
      data.dateDisplay = dto.dateDisplay;
    }
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.published !== undefined) data.published = dto.published;

    const row = await this.prisma.blogArticle.update({ where: { id }, data });
    return toBlogArticleAdminDto(row);
  }

  async softDeleteByAdmin(id: string) {
    const existing = await this.prisma.blogArticle.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Article not found');
    }
    await this.prisma.blogArticle.update({
      where: { id },
      data: { published: false },
    });
  }

  async putHomeByAdmin(dto: BlogHomeConfigBodyDto): Promise<BlogHomeResponseDto> {
    const row = await this.prisma.blogHomeConfig.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        featuredArticleId: dto.featuredArticleId ?? null,
        popularArticleIds: toJsonList(dto.popularArticleIds),
        aiHealthcareArticleIds: toJsonList(dto.aiHealthcareArticleIds),
        secondOpinionArticleIds: toJsonList(dto.secondOpinionArticleIds),
        companyNewsArticleIds: toJsonList(dto.companyNewsArticleIds),
      },
      update: {
        featuredArticleId: dto.featuredArticleId ?? null,
        popularArticleIds: toJsonList(dto.popularArticleIds),
        aiHealthcareArticleIds: toJsonList(dto.aiHealthcareArticleIds),
        secondOpinionArticleIds: toJsonList(dto.secondOpinionArticleIds),
        companyNewsArticleIds: toJsonList(dto.companyNewsArticleIds),
      },
    });
    return {
      featuredArticleId: row.featuredArticleId,
      popularArticleIds: asStringArray(row.popularArticleIds),
      aiHealthcareArticleIds: asStringArray(row.aiHealthcareArticleIds),
      secondOpinionArticleIds: asStringArray(row.secondOpinionArticleIds),
      companyNewsArticleIds: asStringArray(row.companyNewsArticleIds),
    };
  }
}

function toJsonList(arr: string[]): Prisma.InputJsonValue {
  return arr as unknown as Prisma.InputJsonValue;
}

function asStringArray(v: Prisma.JsonValue): string[] {
  if (!Array.isArray(v)) {
    return [];
  }
  return v.filter((x): x is string => typeof x === 'string');
}
