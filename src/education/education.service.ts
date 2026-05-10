import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateEducationResourceBodyDto,
  PatchEducationResourceBodyDto,
} from './dto/admin-education-resource-body.dto';
import { isEducationSlug } from './education.constants';
import {
  toEducationResourceAdminDto,
  toEducationResourceDto,
} from './education.mapper';

@Injectable()
export class EducationService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublic() {
    const rows = await this.prisma.educationResource.findMany({
      where: { published: true },
      orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
    });
    return { items: rows.map(toEducationResourceDto) };
  }

  async getPublicBySlug(slug: string) {
    if (!isEducationSlug(slug)) {
      throw new NotFoundException('Resource not found');
    }
    const row = await this.prisma.educationResource.findFirst({
      where: { slug, published: true },
    });
    if (!row) {
      throw new NotFoundException('Resource not found');
    }
    return toEducationResourceDto(row);
  }

  async listAllForAdmin() {
    const rows = await this.prisma.educationResource.findMany({
      orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
    });
    return { items: rows.map(toEducationResourceAdminDto) };
  }

  async getByAdminId(id: string) {
    const row = await this.prisma.educationResource.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException('Resource not found');
    }
    return toEducationResourceAdminDto(row);
  }

  private toCreateData(
    d: CreateEducationResourceBodyDto,
  ): Prisma.EducationResourceCreateInput {
    return {
      slug: d.slug,
      title: d.title,
      description: d.description,
      bullets: JSON.parse(JSON.stringify(d.bullets)) as Prisma.InputJsonValue,
      iconKey: d.iconKey ?? d.slug,
      published: d.published ?? true,
      sortOrder: d.sortOrder ?? null,
    };
  }

  async createByAdmin(dto: CreateEducationResourceBodyDto) {
    const existing = await this.prisma.educationResource.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException(
        'An education resource with this slug already exists',
      );
    }
    const row = await this.prisma.educationResource.create({
      data: this.toCreateData(dto),
    });
    return toEducationResourceAdminDto(row);
  }

  async patchByAdmin(id: string, dto: PatchEducationResourceBodyDto) {
    const current = await this.prisma.educationResource.findUnique({
      where: { id },
    });
    if (!current) {
      throw new NotFoundException('Resource not found');
    }
    if (dto.slug && dto.slug !== current.slug) {
      const taken = await this.prisma.educationResource.findUnique({
        where: { slug: dto.slug },
      });
      if (taken) {
        throw new ConflictException('Slug already in use');
      }
    }

    const data: Prisma.EducationResourceUpdateInput = {};
    if (dto.slug !== undefined) data.slug = dto.slug;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.bullets !== undefined) {
      data.bullets = JSON.parse(
        JSON.stringify(dto.bullets),
      ) as Prisma.InputJsonValue;
    }
    if (dto.iconKey !== undefined) data.iconKey = dto.iconKey;
    if (dto.published !== undefined) data.published = dto.published;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    const row = await this.prisma.educationResource.update({
      where: { id },
      data,
    });
    return toEducationResourceAdminDto(row);
  }

  async softDeleteByAdmin(id: string) {
    const row = await this.prisma.educationResource.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException('Resource not found');
    }
    await this.prisma.educationResource.update({
      where: { id },
      data: { published: false },
    });
  }
}
