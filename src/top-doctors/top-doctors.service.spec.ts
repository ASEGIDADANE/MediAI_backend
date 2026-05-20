import { Test } from '@nestjs/testing';
import {
  ConditionCategory,
  ConsultationType,
  MedicalSpecialty,
  OnboardingUserRole,
  ProfessionalVerificationStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TopDoctorsService } from './top-doctors.service';

type DoctorRow = {
  userId: string;
  preferredName: string;
  region: string;
  medicalSpecialty: MedicalSpecialty | null;
  verificationReviewedAt: Date | null;
  professionalProfile: unknown;
  user: { capacity: { acceptedConsultationTypes: unknown } | null };
};

function row(over: Partial<DoctorRow> & { userId: string }): DoctorRow {
  const base: DoctorRow = {
    userId: over.userId,
    preferredName: over.userId,
    region: 'Addis Ababa',
    medicalSpecialty: null,
    verificationReviewedAt: new Date('2026-01-01'),
    professionalProfile: { specialty: 'General Practice' },
    user: { capacity: null },
  };
  return { ...base, ...over };
}

function makePrisma(rows: DoctorRow[]) {
  return {
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
    userProfile: {
      findMany: jest.fn().mockResolvedValue(rows),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn().mockResolvedValue(rows.length),
    },
  };
}

async function buildService(prisma: ReturnType<typeof makePrisma>) {
  const mod = await Test.createTestingModule({
    providers: [
      TopDoctorsService,
      { provide: PrismaService, useValue: prisma },
    ],
  }).compile();
  return mod.get(TopDoctorsService);
}

describe('TopDoctorsService.listPublic (Phase 5 smart matching)', () => {
  it('filters by canonical specialty when `conditions` query is set', async () => {
    const prisma = makePrisma([
      row({
        userId: 'cardio',
        medicalSpecialty: MedicalSpecialty.cardiology,
      }),
      row({
        userId: 'derm',
        medicalSpecialty: MedicalSpecialty.dermatology,
      }),
    ]);
    const svc = await buildService(prisma);
    await svc.listPublic({ conditions: [ConditionCategory.heart_circulation] });

    // Inspect the Prisma where clause to confirm IN-filter built correctly.
    const callArgs = prisma.userProfile.findMany.mock.calls[0][0] as {
      where: { medicalSpecialty?: { in?: MedicalSpecialty[] } };
    };
    expect(callArgs.where.medicalSpecialty?.in).toEqual(
      expect.arrayContaining([
        MedicalSpecialty.cardiology,
        MedicalSpecialty.internal_medicine,
      ]),
    );
  });

  it('does NOT apply a specialty filter when conditions are absent', async () => {
    const prisma = makePrisma([row({ userId: 'a' })]);
    const svc = await buildService(prisma);
    await svc.listPublic({});

    const callArgs = prisma.userProfile.findMany.mock.calls[0][0] as {
      where: { medicalSpecialty?: unknown };
    };
    expect(callArgs.where.medicalSpecialty).toBeUndefined();
  });

  it('explicit `medicalSpecialties` overrides condition expansion', async () => {
    const prisma = makePrisma([row({ userId: 'a' })]);
    const svc = await buildService(prisma);
    await svc.listPublic({
      conditions: [ConditionCategory.heart_circulation],
      medicalSpecialties: [MedicalSpecialty.dermatology],
    });

    const callArgs = prisma.userProfile.findMany.mock.calls[0][0] as {
      where: { medicalSpecialty?: { in?: MedicalSpecialty[] } };
    };
    expect(callArgs.where.medicalSpecialty?.in).toEqual([
      MedicalSpecialty.dermatology,
    ]);
  });

  it('boosts in-region doctors above out-of-region peers (anonymous caller with explicit region)', async () => {
    const prisma = makePrisma([
      row({ userId: 'far', region: 'Mekelle' }),
      row({ userId: 'near', region: 'Addis Ababa' }),
    ]);
    const svc = await buildService(prisma);
    const out = await svc.listPublic({ region: 'addis ababa' });

    expect(out.items.map((d) => d.id)).toEqual(['near', 'far']);
    const nearItem = out.items.find((d) => d.id === 'near');
    const farItem = out.items.find((d) => d.id === 'far');
    expect(nearItem?.inRegion).toBe(true);
    expect(farItem?.inRegion).toBe(false);
  });

  it('boosts doctors who match a condition above others with the same DB order', async () => {
    const prisma = makePrisma([
      row({ userId: 'unrelated', medicalSpecialty: MedicalSpecialty.dermatology }),
      row({ userId: 'match', medicalSpecialty: MedicalSpecialty.cardiology }),
    ]);
    const svc = await buildService(prisma);
    const out = await svc.listPublic({
      conditions: [ConditionCategory.heart_circulation],
      // No region context — sort key is matchesConditions only.
    });

    // Both rows pass the DB IN filter only when their specialty is in the
    // expansion. With our mock we returned both regardless to validate the
    // *sort* step in isolation; the matching one must come first.
    expect(out.items[0].id).toBe('match');
    expect(out.items[0].matchesConditions).toBe(true);
    expect(out.items[1].matchesConditions).toBe(false);
  });

  it('attaches acceptedConsultationTypes from DoctorCapacity', async () => {
    const prisma = makePrisma([
      row({
        userId: 'video-only',
        user: {
          capacity: {
            acceptedConsultationTypes: [ConsultationType.video],
          },
        },
      }),
    ]);
    const svc = await buildService(prisma);
    const out = await svc.listPublic({});
    expect(out.items[0].acceptedConsultationTypes).toEqual([
      ConsultationType.video,
    ]);
  });

  it('omits inRegion / matchesConditions when caller has no context to compute them', async () => {
    const prisma = makePrisma([row({ userId: 'a' })]);
    const svc = await buildService(prisma);
    const out = await svc.listPublic({});
    expect(out.items[0].inRegion).toBeUndefined();
    expect(out.items[0].matchesConditions).toBeUndefined();
  });

  it('uses the caller patient profile when conditions/region are not in the query', async () => {
    const prisma = makePrisma([
      row({
        userId: 'cardio-near',
        medicalSpecialty: MedicalSpecialty.cardiology,
        region: 'Addis Ababa',
      }),
    ]);
    prisma.userProfile.findUnique = jest.fn().mockResolvedValue({
      role: OnboardingUserRole.personal,
      region: 'Addis Ababa',
      primaryConditions: [ConditionCategory.heart_circulation],
    });
    const svc = await buildService(prisma);
    const out = await svc.listPublic({}, 'patient-1');

    // Caller context should drive the Prisma IN filter.
    const callArgs = prisma.userProfile.findMany.mock.calls[0][0] as {
      where: { medicalSpecialty?: { in?: MedicalSpecialty[] } };
    };
    expect(callArgs.where.medicalSpecialty?.in).toEqual(
      expect.arrayContaining([MedicalSpecialty.cardiology]),
    );
    expect(out.items[0].inRegion).toBe(true);
    expect(out.items[0].matchesConditions).toBe(true);
  });

  it('ignores caller context when the caller is a doctor (no self-matching applied)', async () => {
    const prisma = makePrisma([row({ userId: 'a' })]);
    prisma.userProfile.findUnique = jest.fn().mockResolvedValue({
      role: OnboardingUserRole.professional,
      region: 'Mekelle',
      primaryConditions: [],
    });
    const svc = await buildService(prisma);
    await svc.listPublic({}, 'doc-1');

    const callArgs = prisma.userProfile.findMany.mock.calls[0][0] as {
      where: { medicalSpecialty?: unknown };
    };
    expect(callArgs.where.medicalSpecialty).toBeUndefined();
  });

  it('always enforces role=professional + verified in the Prisma where', async () => {
    const prisma = makePrisma([row({ userId: 'a' })]);
    const svc = await buildService(prisma);
    await svc.listPublic({});

    const callArgs = prisma.userProfile.findMany.mock.calls[0][0] as {
      where: { role: string; verificationStatus: string };
    };
    expect(callArgs.where.role).toBe(OnboardingUserRole.professional);
    expect(callArgs.where.verificationStatus).toBe(
      ProfessionalVerificationStatus.verified,
    );
  });
});
