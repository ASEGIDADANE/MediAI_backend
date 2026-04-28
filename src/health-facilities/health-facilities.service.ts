import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  takeSkipHealthFacilities,
  type HealthFacilitiesQueryDto,
} from './dto/health-facilities-query.dto';
import { toHealthcareFacilityDto } from './health-facilities.mapper';

@Injectable()
export class HealthFacilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublic(dto: HealthFacilitiesQueryDto) {
    const { take, skip, page, pageSize } = takeSkipHealthFacilities(
      dto.page,
      dto.pageSize,
    );
    const type = dto.type;
    const q = dto.q?.trim().slice(0, 120);

    const where: Prisma.HealthcareFacilityWhereInput = {
      published: true,
      ...(type ? { type } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { address: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.healthcareFacility.findMany({
        where,
        orderBy: [{ name: 'asc' }],
        take,
        skip,
      }),
      this.prisma.healthcareFacility.count({ where }),
    ]);

    return {
      items: rows.map(toHealthcareFacilityDto),
      page,
      pageSize,
      total,
    };
  }

  async getPublicById(id: string) {
    const row = await this.prisma.healthcareFacility.findFirst({
      where: { id, published: true },
    });
    if (!row) {
      throw new NotFoundException('Facility not found');
    }
    return toHealthcareFacilityDto(row);
  }
}
