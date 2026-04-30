import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HealthcareFacilityType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HealthFacilitiesService } from './health-facilities.service';
import { OverpassService } from './overpass.service';

const sampleRow = {
  id: 'fac-001',
  name: 'Tikur Anbessa',
  type: HealthcareFacilityType.hospital,
  address: 'Churchill Ave',
  phone: '+251 11 551 1211',
  rating: 4.2,
  verified: true,
  latitude: 9.0192,
  longitude: 38.7525,
  openNow: true,
  published: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function buildModule(overrides: {
  prisma: unknown;
  overpass?: Partial<OverpassService>;
}) {
  const overpass: Partial<OverpassService> = {
    findNearby: jest.fn().mockResolvedValue([]),
    ...overrides.overpass,
  };
  return Test.createTestingModule({
    providers: [
      HealthFacilitiesService,
      { provide: PrismaService, useValue: overrides.prisma },
      { provide: OverpassService, useValue: overpass },
    ],
  }).compile();
}

describe('HealthFacilitiesService', () => {
  it('listPublic only returns published rows and maps DTOs', async () => {
    const findMany = jest.fn().mockResolvedValue([sampleRow]);
    const count = jest.fn().mockResolvedValue(1);
    const prisma = {
      $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
      healthcareFacility: { findMany, count },
    };
    const mod = await buildModule({ prisma });
    const svc = mod.get(HealthFacilitiesService);
    const res = await svc.listPublic({ page: 1, pageSize: 20 });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({
      id: 'fac-001',
      name: 'Tikur Anbessa',
      type: 'hospital',
      openNow: true,
      source: 'directory',
    });
    expect(res.page).toBe(1);
    expect(res.pageSize).toBe(20);
    expect(res.total).toBe(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ published: true }),
        orderBy: [{ name: 'asc' }],
        take: 20,
        skip: 0,
      }),
    );
  });

  it('listPublic applies type filter', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
      healthcareFacility: { findMany, count },
    };
    const mod = await buildModule({ prisma });
    const svc = mod.get(HealthFacilitiesService);
    await svc.listPublic({ type: HealthcareFacilityType.pharmacy });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          published: true,
          type: HealthcareFacilityType.pharmacy,
        }),
      }),
    );
  });

  it('listPublic applies q on name and address (OR)', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
      healthcareFacility: { findMany, count },
    };
    const mod = await buildModule({ prisma });
    const svc = mod.get(HealthFacilitiesService);
    await svc.listPublic({ q: 'Bole' });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { name: { contains: 'Bole', mode: 'insensitive' } },
            { address: { contains: 'Bole', mode: 'insensitive' } },
          ]),
        }),
      }),
    );
  });

  it('listPublic ignores empty q', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
      healthcareFacility: { findMany, count },
    };
    const mod = await buildModule({ prisma });
    const svc = mod.get(HealthFacilitiesService);
    await svc.listPublic({ q: '   ' });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { published: true },
      }),
    );
  });

  it('listPublic with lat/lng delegates to OverpassService and skips Prisma', async () => {
    const findMany = jest.fn().mockResolvedValue([sampleRow]);
    const count = jest.fn().mockResolvedValue(1);
    const prisma = {
      $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
      healthcareFacility: { findMany, count },
    };
    const overpassRow = {
      id: 'osm-node-1',
      name: 'Real Hospital',
      type: HealthcareFacilityType.hospital,
      address: 'Bole Rd',
      verified: false,
      latitude: 9.005,
      longitude: 38.76,
      distanceKm: 0.42,
      source: 'osm' as const,
    };
    const findNearby = jest.fn().mockResolvedValue([overpassRow]);
    const mod = await buildModule({
      prisma,
      overpass: { findNearby },
    });
    const svc = mod.get(HealthFacilitiesService);
    const res = await svc.listPublic({
      lat: 9.005,
      lng: 38.76,
      radiusKm: 10,
      type: HealthcareFacilityType.hospital,
    });
    expect(findNearby).toHaveBeenCalledWith(
      expect.objectContaining({
        lat: 9.005,
        lng: 38.76,
        radiusKm: 10,
        type: HealthcareFacilityType.hospital,
      }),
    );
    expect(findMany).not.toHaveBeenCalled();
    expect(res.items).toEqual([overpassRow]);
    expect(res.total).toBe(1);
  });

  it('getPublicById returns DTO when published', async () => {
    const findFirst = jest.fn().mockResolvedValue(sampleRow);
    const prisma = {
      healthcareFacility: { findFirst },
    };
    const mod = await buildModule({ prisma });
    const svc = mod.get(HealthFacilitiesService);
    const row = await svc.getPublicById('fac-001');
    expect(row.id).toBe('fac-001');
    expect(row.source).toBe('directory');
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'fac-001', published: true },
    });
  });

  it('getPublicById throws NotFoundException when missing', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const prisma = { healthcareFacility: { findFirst } };
    const mod = await buildModule({ prisma });
    const svc = mod.get(HealthFacilitiesService);
    await expect(svc.getPublicById('fac-999')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
