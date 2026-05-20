import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ConsultationBookingStatus,
  ConsultationType,
  OnboardingUserRole,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountAuditService } from '../me/account-audit.service';
import { AvailabilityService } from './availability.service';

const DOCTOR_ID = 'doc-1';

function makePrisma(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
    userProfile: { findUnique: jest.fn() },
    weeklyAvailabilityRule: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    doctorUnavailableDate: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    doctorCapacity: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
    },
    consultationBooking: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    ...overrides,
  };
}

async function buildService(prisma: ReturnType<typeof makePrisma>) {
  const mod = await Test.createTestingModule({
    providers: [
      AvailabilityService,
      { provide: PrismaService, useValue: prisma },
      // Phase 6 — audit log of availability edits is fire-and-forget; the
      // tests below don't verify the audit call, just the behaviour of the
      // underlying service. A simple stub satisfies the DI container.
      {
        provide: AccountAuditService,
        useValue: { log: jest.fn(async () => undefined) },
      },
    ],
  }).compile();
  return mod.get(AvailabilityService);
}

describe('AvailabilityService', () => {
  describe('role guard', () => {
    it('rejects non-professional callers on listMyRules', async () => {
      const prisma = makePrisma();
      prisma.userProfile.findUnique.mockResolvedValue({
        role: OnboardingUserRole.personal,
      });
      const svc = await buildService(prisma);
      await expect(svc.listMyRules(DOCTOR_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('allows professional callers', async () => {
      const prisma = makePrisma();
      prisma.userProfile.findUnique.mockResolvedValue({
        role: OnboardingUserRole.professional,
      });
      const svc = await buildService(prisma);
      await expect(svc.listMyRules(DOCTOR_ID)).resolves.toEqual({ items: [] });
    });
  });

  describe('replaceMyRules', () => {
    it('runs delete+create inside a single transaction', async () => {
      const prisma = makePrisma();
      prisma.userProfile.findUnique.mockResolvedValue({
        role: OnboardingUserRole.professional,
      });
      prisma.weeklyAvailabilityRule.findMany.mockResolvedValue([]);

      const svc = await buildService(prisma);
      await svc.replaceMyRules(DOCTOR_ID, {
        items: [
          {
            dayOfWeek: 1,
            startTimeMinutes: 540,
            endTimeMinutes: 1020,
            slotDurationMinutes: 30,
            timezone: 'UTC',
          },
        ],
      });

      expect(prisma.weeklyAvailabilityRule.deleteMany).toHaveBeenCalledWith({
        where: { doctorUserId: DOCTOR_ID },
      });
      expect(prisma.weeklyAvailabilityRule.createMany).toHaveBeenCalledWith({
        data: [
          {
            doctorUserId: DOCTOR_ID,
            dayOfWeek: 1,
            startTimeMinutes: 540,
            endTimeMinutes: 1020,
            slotDurationMinutes: 30,
            timezone: 'UTC',
          },
        ],
      });
    });

    it('rejects rules where end <= start', async () => {
      const prisma = makePrisma();
      prisma.userProfile.findUnique.mockResolvedValue({
        role: OnboardingUserRole.professional,
      });
      const svc = await buildService(prisma);
      await expect(
        svc.replaceMyRules(DOCTOR_ID, {
          items: [
            {
              dayOfWeek: 1,
              startTimeMinutes: 600,
              endTimeMinutes: 600,
              slotDurationMinutes: 30,
              timezone: 'UTC',
            },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts an empty array (clear all)', async () => {
      const prisma = makePrisma();
      prisma.userProfile.findUnique.mockResolvedValue({
        role: OnboardingUserRole.professional,
      });
      const svc = await buildService(prisma);
      await svc.replaceMyRules(DOCTOR_ID, { items: [] });
      expect(prisma.weeklyAvailabilityRule.deleteMany).toHaveBeenCalled();
      expect(prisma.weeklyAvailabilityRule.createMany).not.toHaveBeenCalled();
    });
  });

  describe('computeSlots', () => {
    it('returns 404 when the target user is not a professional', async () => {
      const prisma = makePrisma();
      prisma.userProfile.findUnique.mockResolvedValue({
        role: OnboardingUserRole.personal,
      });
      const svc = await buildService(prisma);
      await expect(svc.computeSlots(DOCTOR_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('subtracts active bookings from the generated slots', async () => {
      const prisma = makePrisma();
      prisma.userProfile.findUnique.mockResolvedValue({
        role: OnboardingUserRole.professional,
      });
      prisma.weeklyAvailabilityRule.findMany.mockResolvedValue([
        {
          dayOfWeek: 1,
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 17 * 60,
          slotDurationMinutes: 30,
          timezone: 'UTC',
        },
      ]);
      prisma.doctorUnavailableDate.findMany.mockResolvedValue([]);
      // Phase 3 — booking uses the real `scheduledFor` column. A 30-min
      // booking at 09:00 UTC therefore blocks the 09:00 slot.
      prisma.consultationBooking.findMany.mockResolvedValue([
        {
          scheduledFor: new Date('2026-06-08T09:00:00.000Z'),
          durationMinutes: 30,
          createdAt: new Date('2026-06-07T00:00:00.000Z'),
        },
      ]);
      prisma.doctorCapacity.findUnique.mockResolvedValue(null);

      const svc = await buildService(prisma);
      const out = await svc.computeSlots(
        DOCTOR_ID,
        '2026-06-07T00:00:00.000Z',
        7,
      );

      const findManyMock = prisma.consultationBooking
        .findMany as unknown as jest.MockedFunction<
        (
          args: import('../generated/prisma/client').Prisma.ConsultationBookingFindManyArgs,
        ) => Promise<unknown[]>
      >;
      const findManyArgs = findManyMock.mock.calls[0][0];
      const where = findManyArgs.where as {
        topDoctorId: string;
        status: { in: ConsultationBookingStatus[] };
      };
      expect(where.topDoctorId).toBe(DOCTOR_ID);
      expect(where.status.in).toEqual(
        expect.arrayContaining([
          ConsultationBookingStatus.pending_payment,
          ConsultationBookingStatus.paid,
          ConsultationBookingStatus.pending_doctor_approval,
          ConsultationBookingStatus.approved,
          ConsultationBookingStatus.confirmed,
        ]),
      );
      const select = findManyArgs.select as {
        scheduledFor: boolean;
        durationMinutes: boolean;
        createdAt: boolean;
      };
      expect(select.scheduledFor).toBe(true);
      expect(select.durationMinutes).toBe(true);
      expect(select.createdAt).toBe(true);
      expect(
        out.items.find((s) => s.startsAt === '2026-06-08T09:00:00.000Z'),
      ).toBeUndefined();
      expect(out.items[0].startsAt).toBe('2026-06-08T09:30:00.000Z');
    });

    it("applies the doctor's maxAppointmentsPerDay cap", async () => {
      const prisma = makePrisma();
      prisma.userProfile.findUnique.mockResolvedValue({
        role: OnboardingUserRole.professional,
      });
      prisma.weeklyAvailabilityRule.findMany.mockResolvedValue([
        {
          dayOfWeek: 1,
          startTimeMinutes: 9 * 60,
          endTimeMinutes: 17 * 60,
          slotDurationMinutes: 30,
          timezone: 'UTC',
        },
      ]);
      prisma.doctorCapacity.findUnique.mockResolvedValue({
        maxAppointmentsPerDay: 3,
        defaultConsultationType: ConsultationType.video,
        acceptedConsultationTypes: [],
      });
      const svc = await buildService(prisma);
      const out = await svc.computeSlots(
        DOCTOR_ID,
        '2026-06-07T00:00:00.000Z',
        7,
      );
      expect(out.items).toHaveLength(3);
    });
  });

  describe('unavailable dates', () => {
    it('404s when deleting a date that belongs to another doctor', async () => {
      const prisma = makePrisma();
      prisma.userProfile.findUnique.mockResolvedValue({
        role: OnboardingUserRole.professional,
      });
      prisma.doctorUnavailableDate.findUnique.mockResolvedValue({
        doctorUserId: 'someone-else',
      });
      const svc = await buildService(prisma);
      await expect(
        svc.deleteUnavailableDate(DOCTOR_ID, 'block-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.doctorUnavailableDate.delete).not.toHaveBeenCalled();
    });
  });

  describe('capacity', () => {
    it('upserts with defaults when no row yet exists', async () => {
      const prisma = makePrisma();
      prisma.userProfile.findUnique.mockResolvedValue({
        role: OnboardingUserRole.professional,
      });
      prisma.doctorCapacity.findUnique.mockResolvedValue(null);
      prisma.doctorCapacity.upsert.mockResolvedValue({
        maxAppointmentsPerDay: 6,
        defaultConsultationType: ConsultationType.video,
        acceptedConsultationTypes: [
          ConsultationType.video,
          ConsultationType.written,
        ],
      });
      const svc = await buildService(prisma);
      const out = await svc.putMyCapacity(DOCTOR_ID, {
        maxAppointmentsPerDay: 6,
        acceptedConsultationTypes: [
          ConsultationType.video,
          ConsultationType.written,
        ],
      });
      expect(prisma.doctorCapacity.upsert).toHaveBeenCalled();
      expect(out.maxAppointmentsPerDay).toBe(6);
      expect(out.acceptedConsultationTypes).toEqual([
        ConsultationType.video,
        ConsultationType.written,
      ]);
    });
  });
});
