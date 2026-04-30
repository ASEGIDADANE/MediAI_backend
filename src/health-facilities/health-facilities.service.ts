import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  takeSkipHealthFacilities,
  type HealthFacilitiesQueryDto,
} from './dto/health-facilities-query.dto';
import { HealthcareFacilityDto } from './dto/health-facility-response.dto';
import { toHealthcareFacilityDto } from './health-facilities.mapper';
import { OverpassService } from './overpass.service';

@Injectable()
export class HealthFacilitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly overpass: OverpassService,
  ) {}

  async listPublic(dto: HealthFacilitiesQueryDto) {
    const { take, skip, page, pageSize } = takeSkipHealthFacilities(
      dto.page,
      dto.pageSize,
    );
    const type = dto.type;
    // Trim defensively: HTTP requests are normalised by the DTO `@Transform`,
    // but in-process callers (e.g. unit tests, future internal usage) may pass
    // an unnormalised string.
    const trimmed = dto.q?.trim();
    const q = trimmed ? trimmed : undefined;
    const hasGeo = dto.lat != null && dto.lng != null;

    if (hasGeo) {
      return this.listNearby({
        lat: dto.lat as number,
        lng: dto.lng as number,
        radiusKm: dto.radiusKm,
        type,
        q,
        take,
        skip,
        page,
        pageSize,
      });
    }

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
      items: rows.map((r) => toHealthcareFacilityDto(r)),
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

  /**
   * Geo-aware list — sourced from live OpenStreetMap data via Overpass.
   *
   * The earlier implementation served from the seeded `healthcare_facility`
   * directory, which made "Find Nearby" feel static (the same 10 rows every
   * time, regardless of where the user actually was). Now we fetch real
   * world POIs around the user's coordinates and paginate the result in
   * memory; pagination is small for this use case (50 items per page max),
   * so doing it post-fetch is fine.
   */
  private async listNearby(args: {
    lat: number;
    lng: number;
    radiusKm?: number;
    type?: HealthFacilitiesQueryDto['type'];
    q?: string;
    take: number;
    skip: number;
    page: number;
    pageSize: number;
  }) {
    const { lat, lng, radiusKm, type, q, take, skip, page, pageSize } = args;

    const all = await this.overpass.findNearby({
      lat,
      lng,
      radiusKm: radiusKm ?? 10,
      type,
      q,
    });

    const items: HealthcareFacilityDto[] = all.slice(skip, skip + take);

    return {
      items,
      page,
      pageSize,
      total: all.length,
    };
  }
}
