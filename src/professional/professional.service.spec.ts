import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ConsultationBookingStatus,
  OnboardingUserRole,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MeService } from '../me/me.service';
import { ProfessionalService } from './professional.service';

const DOCTOR_ID = 'doc-1';
const PATIENT_ID = 'pat-1';

function makePrisma(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    userProfile: {
      findUnique: jest.fn(),
    },
    doctorPatientThread: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
    },
    doctorPatientMessage: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    // Phase 4 — doctor's `sendMessage` runs `assertChatWindowOpen` which
    // looks up bookings. Default: one approved future-slot booking so the
    // window is open; chat-locked tests override.
    consultationBooking: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'booking-1',
          status: ConsultationBookingStatus.approved,
          scheduledFor: new Date(Date.now() + 60 * 60 * 1000),
          durationMinutes: 30,
          completedAt: null,
          createdAt: new Date(),
        },
      ]),
    },
    ...overrides,
  };
}

function makeMeService() {
  return {
    patchProfile: jest.fn().mockResolvedValue({}),
    putMedicalHistory: jest.fn().mockResolvedValue({}),
  };
}

async function buildService(
  prisma: ReturnType<typeof makePrisma>,
  meService: ReturnType<typeof makeMeService> = makeMeService(),
) {
  const mod = await Test.createTestingModule({
    providers: [
      ProfessionalService,
      { provide: PrismaService, useValue: prisma },
      { provide: MeService, useValue: meService },
    ],
  }).compile();
  return mod.get(ProfessionalService);
}

describe('ProfessionalService', () => {
  it('listPatients throws Forbidden if caller is not professional', async () => {
    const prisma = makePrisma();
    prisma.userProfile.findUnique.mockResolvedValue({
      role: OnboardingUserRole.personal,
    });
    const svc = await buildService(prisma);
    await expect(svc.listPatients(DOCTOR_ID, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('listPatients only returns patients with an active booking and gates the SQL where-clause', async () => {
    const prisma = makePrisma();
    prisma.userProfile.findUnique.mockResolvedValue({
      role: OnboardingUserRole.professional,
    });
    // Repository returns the patient because the where-clause filtered for
    // active bookings; the service must not do any additional filtering of
    // its own.
    prisma.user.findMany.mockResolvedValue([
      {
        id: PATIENT_ID,
        email: 'pat@example.com',
        createdAt: new Date('2026-04-01T10:00:00Z'),
        profile: {
          userId: PATIENT_ID,
          role: OnboardingUserRole.personal,
          preferredName: 'Sara',
          ageYears: 31,
          sexAtBirth: 'female',
          region: 'Ethiopia',
          medicalHistory: { allergies: ['penicillin'] },
        },
      },
    ]);
    prisma.user.count.mockResolvedValue(1);

    const svc = await buildService(prisma);
    const res = await svc.listPatients(DOCTOR_ID, {});

    expect(res.total).toBe(1);
    expect(res.items[0]).toMatchObject({
      id: PATIENT_ID,
      preferredName: 'Sara',
      hasMedicalHistory: true,
    });

    // The where-clause itself must (a) exclude the caller, (b) restrict to
    // `personal` users, and (c) require at least one active booking with
    // this doctor — that "AND" is the privacy gate.
    const findMany = prisma.user.findMany;
    const where = (findMany.mock.calls[0][0] as { where: { AND: unknown[] } })
      .where;
    const flat = JSON.stringify(where);
    expect(flat).toContain(DOCTOR_ID);
    expect(flat).toContain('consultationBookings');
    // Phase 4 — "active relationship" tightened to require an explicit
    // doctor approval. Transient `paid` no longer counts; new approved
    // status and legacy `confirmed` do.
    expect(flat).toContain(ConsultationBookingStatus.approved);
    expect(flat).toContain(ConsultationBookingStatus.confirmed);
    expect(flat).not.toContain(`"${ConsultationBookingStatus.paid}"`);
    expect(flat).toContain(OnboardingUserRole.personal);
  });

  it('listPatients returns an empty list when the doctor has no active bookings', async () => {
    const prisma = makePrisma();
    prisma.userProfile.findUnique.mockResolvedValue({
      role: OnboardingUserRole.professional,
    });
    // No matching rows — simulates a verified doctor with zero patients.
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);

    const svc = await buildService(prisma);
    const res = await svc.listPatients(DOCTOR_ID, {});

    expect(res.items).toEqual([]);
    expect(res.total).toBe(0);
  });

  it('sendMessage rejects an unrelated patient (no active booking) with 404', async () => {
    const prisma = makePrisma();
    prisma.userProfile.findUnique.mockResolvedValue({
      role: OnboardingUserRole.professional,
    });
    // `requirePatient` uses findFirst; returning null means the relationship
    // filter excluded the patient.
    prisma.user.findFirst.mockResolvedValue(null);

    const svc = await buildService(prisma);
    await expect(
      svc.sendMessage(DOCTOR_ID, PATIENT_ID, 'hi'),
    ).rejects.toBeInstanceOf(NotFoundException);
    // We must never reach thread creation if the relationship check failed.
    expect(prisma.doctorPatientThread.create).not.toHaveBeenCalled();
    expect(prisma.doctorPatientMessage.create).not.toHaveBeenCalled();
  });

  it('sendMessage creates the thread on first send and persists the message when a booking exists', async () => {
    const prisma = makePrisma();
    prisma.userProfile.findUnique.mockResolvedValue({
      role: OnboardingUserRole.professional,
    });
    prisma.user.findFirst.mockResolvedValue({
      id: PATIENT_ID,
      email: 'pat@example.com',
      profile: {
        role: OnboardingUserRole.personal,
        preferredName: 'Sara',
      },
    });
    prisma.doctorPatientThread.findUnique.mockResolvedValue(null);
    prisma.doctorPatientThread.create.mockResolvedValue({
      id: 'thread-1',
      doctorUserId: DOCTOR_ID,
      patientUserId: PATIENT_ID,
    });
    prisma.doctorPatientMessage.create.mockResolvedValue({
      id: 'msg-1',
      threadId: 'thread-1',
      senderUserId: DOCTOR_ID,
      body: 'hi',
      createdAt: new Date('2026-04-30T12:00:00Z'),
    });

    const svc = await buildService(prisma);
    const out = await svc.sendMessage(DOCTOR_ID, PATIENT_ID, '   hi   ');

    expect(prisma.doctorPatientThread.create).toHaveBeenCalledWith({
      data: { doctorUserId: DOCTOR_ID, patientUserId: PATIENT_ID },
    });
    expect(out).toMatchObject({
      id: 'msg-1',
      sender: 'doctor',
      body: 'hi',
    });
  });

  it('getPatient returns 404 for an unrelated user (whether doctor or patient)', async () => {
    const prisma = makePrisma();
    prisma.userProfile.findUnique.mockResolvedValue({
      role: OnboardingUserRole.professional,
    });
    // The relationship-gated findFirst returns null both when the target
    // doesn't exist, isn't a patient, or isn't booked with us — collapsing
    // these into a single 404 prevents id enumeration.
    prisma.user.findFirst.mockResolvedValue(null);
    const svc = await buildService(prisma);
    await expect(
      svc.getPatient(DOCTOR_ID, 'other-doctor'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
