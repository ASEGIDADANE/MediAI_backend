import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { TopDoctor } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTopDoctorBodyDto, PatchTopDoctorBodyDto } from './dto/admin-top-doctor-body.dto';
import { takeSkipTopDoctors, TopDoctorsQueryDto } from './dto/top-doctors-query.dto';
import { toTopDoctorDto } from './top-doctors.mapper';

type TopDoctorCountRow = { c: bigint };

@Injectable()
export class TopDoctorsService {
  constructor(private readonly prisma: PrismaService) {}

  private mapSnakeToTopDoctor(r: Record<string, unknown>): TopDoctor {
    return {
      id: r.id as string,
      name: r.name as string,
      role: r.role as string,
      specialty: r.specialty as string,
      subSpecialty: r.sub_specialty as string,
      yearsOfExperience: Number(r.years_of_experience),
      videoFee: Number(r.video_fee),
      writtenFee: Number(r.written_fee),
      heroImageUrl: r.hero_image_url as string,
      educationDegree: r.education_degree as string,
      educationYear: r.education_year as string,
      publicationsSummary: r.publications_summary as string,
      diseases: r.diseases as Prisma.JsonValue,
      biography: r.biography as Prisma.JsonValue,
      experience: r.experience as Prisma.JsonValue,
      affiliations: r.affiliations as Prisma.JsonValue,
      published: r.published as boolean,
      sortOrder: r.sort_order as number | null,
      createdAt: r.created_at as Date,
      updatedAt: r.updated_at as Date,
    } as TopDoctor;
  }

  async listPublic(dto: TopDoctorsQueryDto) {
    const { take, skip, page, pageSize } = takeSkipTopDoctors(
      dto.page,
      dto.pageSize,
    );
    const specialty = dto.specialty?.trim();
    const q = dto.q?.trim().slice(0, 120);

    const baseWhere: Prisma.TopDoctorWhereInput = {
      published: true,
      ...(specialty
        ? { specialty: { equals: specialty, mode: 'insensitive' } }
        : {}),
    };

    if (!q) {
      const [rows, total] = await this.prisma.$transaction([
        this.prisma.topDoctor.findMany({
          where: baseWhere,
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          take,
          skip,
        }),
        this.prisma.topDoctor.count({ where: baseWhere }),
      ]);
      return {
        items: rows.map(toTopDoctorDto),
        page,
        pageSize,
        total,
      };
    }

    const pattern = `%${q}%`;
    const specClause = specialty
      ? Prisma.sql`AND LOWER("specialty") = LOWER(${specialty})`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>(Prisma.sql`
      SELECT * FROM "top_doctor"
      WHERE "published" = true
      ${specClause}
      AND (
        "name" ILIKE ${pattern}
        OR "specialty" ILIKE ${pattern}
        OR "sub_specialty" ILIKE ${pattern}
        OR "diseases"::text ILIKE ${pattern}
      )
      ORDER BY "sort_order" ASC NULLS LAST, "name" ASC
      LIMIT ${BigInt(take)} OFFSET ${BigInt(skip)}
    `);

    const countRows = await this.prisma.$queryRaw<TopDoctorCountRow[]>(Prisma.sql`
      SELECT COUNT(*)::bigint AS c FROM "top_doctor"
      WHERE "published" = true
      ${specClause}
      AND (
        "name" ILIKE ${pattern}
        OR "specialty" ILIKE ${pattern}
        OR "sub_specialty" ILIKE ${pattern}
        OR "diseases"::text ILIKE ${pattern}
      )
    `);

    const total = Number(countRows[0]?.c ?? 0n);
    return {
      items: rows.map((r) => toTopDoctorDto(this.mapSnakeToTopDoctor(r))),
      page,
      pageSize,
      total,
    };
  }

  async getPublicById(id: string) {
    const row = await this.prisma.topDoctor.findFirst({
      where: { id, published: true },
    });
    if (!row) {
      throw new NotFoundException('Top doctor not found');
    }
    return toTopDoctorDto(row);
  }

  async listSpecialties(): Promise<string[]> {
    const rows = await this.prisma.topDoctor.findMany({
      where: { published: true },
      select: { specialty: true },
      distinct: ['specialty'],
      orderBy: { specialty: 'asc' },
    });
    return rows.map((r) => r.specialty);
  }

  bodyToPrismaData(d: CreateTopDoctorBodyDto): Prisma.TopDoctorCreateInput {
    const toJson = (v: unknown): Prisma.InputJsonValue =>
      JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
    return {
      name: d.name,
      role: d.role,
      specialty: d.specialty,
      subSpecialty: d.subSpecialty,
      yearsOfExperience: d.yearsOfExperience,
      videoFee: d.consultationFees.video,
      writtenFee: d.consultationFees.written,
      heroImageUrl: d.heroImageUrl,
      educationDegree: d.education.degree,
      educationYear: d.education.year,
      publicationsSummary: d.publicationsSummary,
      diseases: toJson(d.diseases),
      biography: toJson(d.biography),
      experience: toJson(d.experience),
      affiliations: toJson(d.affiliations),
      published: d.published ?? true,
      sortOrder: d.sortOrder ?? null,
    };
  }

  async createByAdmin(dto: CreateTopDoctorBodyDto) {
    const row = await this.prisma.topDoctor.create({
      data: this.bodyToPrismaData(dto),
    });
    return toTopDoctorDto(row);
  }

  async patchByAdmin(id: string, dto: PatchTopDoctorBodyDto) {
    const existing = await this.prisma.topDoctor.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Top doctor not found');
    }

    const data: Prisma.TopDoctorUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.specialty !== undefined) data.specialty = dto.specialty;
    if (dto.subSpecialty !== undefined) data.subSpecialty = dto.subSpecialty;
    if (dto.yearsOfExperience !== undefined) {
      data.yearsOfExperience = dto.yearsOfExperience;
    }
    if (dto.consultationFees !== undefined) {
      data.videoFee = dto.consultationFees.video;
      data.writtenFee = dto.consultationFees.written;
    }
    if (dto.heroImageUrl !== undefined) data.heroImageUrl = dto.heroImageUrl;
    if (dto.education !== undefined) {
      data.educationDegree = dto.education.degree;
      data.educationYear = dto.education.year;
    }
    if (dto.biography !== undefined) {
      data.biography = JSON.parse(
        JSON.stringify(dto.biography),
      ) as Prisma.InputJsonValue;
    }
    if (dto.experience !== undefined) {
      data.experience = JSON.parse(
        JSON.stringify(dto.experience),
      ) as Prisma.InputJsonValue;
    }
    if (dto.affiliations !== undefined) {
      data.affiliations = JSON.parse(
        JSON.stringify(dto.affiliations),
      ) as Prisma.InputJsonValue;
    }
    if (dto.diseases !== undefined) {
      data.diseases = JSON.parse(
        JSON.stringify(dto.diseases),
      ) as Prisma.InputJsonValue;
    }
    if (dto.publicationsSummary !== undefined) {
      data.publicationsSummary = dto.publicationsSummary;
    }
    if (dto.published !== undefined) data.published = dto.published;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    const row = await this.prisma.topDoctor.update({ where: { id }, data });
    return toTopDoctorDto(row);
  }

  async softDeleteByAdmin(id: string) {
    const existing = await this.prisma.topDoctor.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Top doctor not found');
    }
    await this.prisma.topDoctor.update({
      where: { id },
      data: { published: false },
    });
  }
}
