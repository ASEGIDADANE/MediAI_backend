import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { OnboardingUserRole } from '../generated/prisma/client';
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
    (prisma.userProfile.findUnique as jest.Mock).mockResolvedValue({
      role: OnboardingUserRole.personal,
    });
    const svc = await buildService(prisma);
    await expect(svc.listPatients(DOCTOR_ID, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('listPatients excludes the caller and only returns personal users', async () => {
    const prisma = makePrisma();
    (prisma.userProfile.findUnique as jest.Mock).mockResolvedValue({
      role: OnboardingUserRole.professional,
    });
    (prisma.user.findMany as jest.Mock).mockResolvedValue([
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
    (prisma.user.count as jest.Mock).mockResolvedValue(1);

    const svc = await buildService(prisma);
    const res = await svc.listPatients(DOCTOR_ID, {});

    expect(res.total).toBe(1);
    expect(res.items[0]).toMatchObject({
      id: PATIENT_ID,
      preferredName: 'Sara',
      age: '31',
      sexAtBirth: 'female',
      hasMedicalHistory: true,
      lastActivityAt: null,
    });

    const findMany = prisma.user.findMany as jest.Mock;
    const where = (findMany.mock.calls[0][0] as { where: unknown }).where as {
      id: { not: string };
      profile: { is: { role: string } };
    };
    expect(where.id.not).toBe(DOCTOR_ID);
    expect(where.profile.is.role).toBe(OnboardingUserRole.personal);
  });

  it('sendMessage creates the thread on first send and persists the message', async () => {
    const prisma = makePrisma();
    (prisma.userProfile.findUnique as jest.Mock).mockResolvedValue({
      role: OnboardingUserRole.professional,
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: PATIENT_ID,
      email: 'pat@example.com',
      profile: {
        role: OnboardingUserRole.personal,
        preferredName: 'Sara',
      },
    });
    (prisma.doctorPatientThread.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.doctorPatientThread.create as jest.Mock).mockResolvedValue({
      id: 'thread-1',
      doctorUserId: DOCTOR_ID,
      patientUserId: PATIENT_ID,
    });
    (prisma.doctorPatientMessage.create as jest.Mock).mockResolvedValue({
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

  it('getPatient rejects calling on a non-personal user', async () => {
    const prisma = makePrisma();
    (prisma.userProfile.findUnique as jest.Mock).mockResolvedValue({
      role: OnboardingUserRole.professional,
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'other-doctor',
      email: 'other@doctor.com',
      createdAt: new Date(),
      profile: { role: OnboardingUserRole.professional },
    });
    const svc = await buildService(prisma);
    await expect(
      svc.getPatient(DOCTOR_ID, 'other-doctor'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
