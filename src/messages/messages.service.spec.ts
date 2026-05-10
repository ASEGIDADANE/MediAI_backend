import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from './messages.service';

const PATIENT_ID = 'pat-1';
const DOCTOR_ID = 'doc-1';
const THREAD_ID = 'thr-1';

function makePrisma() {
  return {
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
    userProfile: {
      // Default to patient role; tests for doctor inbox override this.
      findUnique: jest.fn().mockResolvedValue({ role: 'personal' }),
    },
    doctorPatientThread: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    doctorPatientMessage: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

async function buildService(prisma: ReturnType<typeof makePrisma>) {
  const mod = await Test.createTestingModule({
    providers: [MessagesService, { provide: PrismaService, useValue: prisma }],
  }).compile();
  return mod.get(MessagesService);
}

function doctorRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DOCTOR_ID,
    email: 'doc@example.com',
    profile: {
      preferredName: 'Dr Hadiya',
      professionalProfile: {
        fullName: 'Hadiya M., MD',
        specialty: 'Cardiology',
      },
    },
    ...overrides,
  };
}

function patientRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PATIENT_ID,
    email: 'pat@example.com',
    profile: { preferredName: 'Kiyar Ali' },
    ...overrides,
  };
}

describe('MessagesService', () => {
  it('listThreads (patient) filters by patientUserId and excludes empty threads', async () => {
    const prisma = makePrisma();
    prisma.doctorPatientThread.findMany.mockResolvedValue([
      {
        id: THREAD_ID,
        doctorUserId: DOCTOR_ID,
        patientUserId: PATIENT_ID,
        updatedAt: new Date('2026-05-01T10:00:00Z'),
        doctor: doctorRow(),
        patient: patientRow(),
        messages: [
          {
            id: 'm1',
            body: 'Hello — please send your latest blood pressure readings.',
            senderUserId: DOCTOR_ID,
            createdAt: new Date('2026-05-01T10:00:00Z'),
          },
        ],
        _count: { messages: 2 },
      },
    ]);

    const svc = await buildService(prisma);
    const out = await svc.listThreads(PATIENT_ID);

    expect(prisma.doctorPatientThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          patientUserId: PATIENT_ID,
          messages: { some: {} },
        },
      }),
    );

    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toMatchObject({
      threadId: THREAD_ID,
      doctorUserId: DOCTOR_ID,
      doctorName: 'Hadiya M., MD',
      doctorSpecialty: 'Cardiology',
      patientUserId: PATIENT_ID,
      patientName: 'Kiyar Ali',
      lastMessageAt: '2026-05-01T10:00:00.000Z',
      lastMessageSender: 'doctor',
      unreadCount: 2,
    });
    expect(out.items[0].lastMessagePreview).toContain('Hello');
  });

  it('listThreads (doctor) filters by doctorUserId so each doctor only sees their own threads', async () => {
    const prisma = makePrisma();
    prisma.userProfile.findUnique.mockResolvedValue({
      role: 'professional',
    });
    prisma.doctorPatientThread.findMany.mockResolvedValue([
      {
        id: THREAD_ID,
        doctorUserId: DOCTOR_ID,
        patientUserId: PATIENT_ID,
        updatedAt: new Date('2026-05-01T10:00:00Z'),
        doctor: doctorRow(),
        patient: patientRow(),
        messages: [
          {
            id: 'm1',
            body: 'How is the new dosage working for you?',
            senderUserId: DOCTOR_ID,
            createdAt: new Date('2026-05-01T10:00:00Z'),
          },
        ],
        _count: { messages: 0 },
      },
    ]);

    const svc = await buildService(prisma);
    const out = await svc.listThreads(DOCTOR_ID);

    expect(prisma.doctorPatientThread.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          doctorUserId: DOCTOR_ID,
          messages: { some: {} },
        },
      }),
    );
    expect(out.items[0]).toMatchObject({
      threadId: THREAD_ID,
      doctorUserId: DOCTOR_ID,
      patientUserId: PATIENT_ID,
      patientName: 'Kiyar Ali',
      lastMessageSender: 'doctor',
    });
  });

  it('getUnreadCount counts unread inbound messages, scoped by caller role', async () => {
    const prisma = makePrisma();
    prisma.userProfile.findUnique.mockResolvedValue({
      role: 'professional',
    });
    prisma.doctorPatientMessage.count.mockResolvedValue(7);

    const svc = await buildService(prisma);
    const out = await svc.getUnreadCount(DOCTOR_ID);

    expect(prisma.doctorPatientMessage.count).toHaveBeenCalledWith({
      where: {
        readAt: null,
        NOT: { senderUserId: DOCTOR_ID },
        thread: { doctorUserId: DOCTOR_ID },
      },
    });
    expect(out).toEqual({ count: 7 });
  });

  it('listThreads marks the patient as the last sender when they wrote it', async () => {
    const prisma = makePrisma();
    prisma.doctorPatientThread.findMany.mockResolvedValue([
      {
        id: THREAD_ID,
        doctorUserId: DOCTOR_ID,
        patientUserId: PATIENT_ID,
        updatedAt: new Date('2026-05-01T10:00:00Z'),
        doctor: doctorRow(),
        patient: patientRow(),
        messages: [
          {
            id: 'm1',
            body: 'thanks doctor',
            senderUserId: PATIENT_ID,
            createdAt: new Date('2026-05-01T10:00:00Z'),
          },
        ],
        _count: { messages: 0 },
      },
    ]);

    const svc = await buildService(prisma);
    const out = await svc.listThreads(PATIENT_ID);
    expect(out.items[0].lastMessageSender).toBe('patient');
    expect(out.items[0].unreadCount).toBe(0);
  });

  it('listThreads falls back to preferredName, then email-local-part for doctorName', async () => {
    const prisma = makePrisma();
    prisma.doctorPatientThread.findMany.mockResolvedValue([
      {
        id: 't-prefname',
        doctorUserId: DOCTOR_ID,
        patientUserId: PATIENT_ID,
        updatedAt: new Date('2026-05-01T10:00:00Z'),
        doctor: doctorRow({
          profile: { preferredName: 'Anna', professionalProfile: null },
        }),
        patient: patientRow(),
        messages: [],
        _count: { messages: 0 },
      },
      {
        id: 't-email',
        doctorUserId: DOCTOR_ID,
        patientUserId: PATIENT_ID,
        updatedAt: new Date('2026-05-01T09:00:00Z'),
        doctor: doctorRow({
          email: 'd2@example.com',
          profile: { preferredName: '', professionalProfile: null },
        }),
        patient: patientRow(),
        messages: [],
        _count: { messages: 0 },
      },
    ]);

    const svc = await buildService(prisma);
    const out = await svc.listThreads(PATIENT_ID);
    expect(out.items[0].doctorName).toBe('Anna');
    expect(out.items[0].doctorSpecialty).toBeNull();
    expect(out.items[1].doctorName).toBe('d2');
  });

  it('getThread throws 404 when thread does not exist', async () => {
    const prisma = makePrisma();
    prisma.doctorPatientThread.findUnique.mockResolvedValue(null);
    const svc = await buildService(prisma);
    await expect(
      svc.getThread(PATIENT_ID, THREAD_ID, 50),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getThread throws 403 when caller is not the patient on the thread', async () => {
    const prisma = makePrisma();
    prisma.doctorPatientThread.findUnique.mockResolvedValue({
      id: THREAD_ID,
      patientUserId: 'someone-else',
      doctor: doctorRow(),
    });
    const svc = await buildService(prisma);
    await expect(
      svc.getThread(PATIENT_ID, THREAD_ID, 50),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // Should NOT mark anything as read for a non-participant.
    expect(prisma.doctorPatientMessage.updateMany).not.toHaveBeenCalled();
  });

  it('getThread marks doctor → patient messages as read and returns oldest-first', async () => {
    const prisma = makePrisma();
    prisma.doctorPatientThread.findUnique.mockResolvedValue({
      id: THREAD_ID,
      patientUserId: PATIENT_ID,
      doctor: doctorRow(),
    });
    prisma.doctorPatientMessage.findMany.mockResolvedValue([
      {
        id: 'm-newest',
        threadId: THREAD_ID,
        senderUserId: PATIENT_ID,
        body: 'thanks',
        readAt: null,
        createdAt: new Date('2026-05-01T11:00:00Z'),
      },
      {
        id: 'm-older',
        threadId: THREAD_ID,
        senderUserId: DOCTOR_ID,
        body: 'how are you',
        readAt: null,
        createdAt: new Date('2026-05-01T10:00:00Z'),
      },
    ]);

    const svc = await buildService(prisma);
    const out = await svc.getThread(PATIENT_ID, THREAD_ID, 50);

    expect(prisma.doctorPatientMessage.updateMany).toHaveBeenCalledWith({
      where: {
        threadId: THREAD_ID,
        readAt: null,
        NOT: { senderUserId: PATIENT_ID },
      },
      data: expect.objectContaining({ readAt: expect.any(Date) }),
    });

    expect(out.messages.map((m) => m.id)).toEqual(['m-older', 'm-newest']);
    expect(out.messages[0]).toMatchObject({
      sender: 'doctor',
      mine: false,
    });
    expect(out.messages[1]).toMatchObject({
      sender: 'patient',
      mine: true,
    });
  });

  it('sendMessage rejects empty body with 400', async () => {
    const prisma = makePrisma();
    const svc = await buildService(prisma);
    await expect(
      svc.sendMessage(PATIENT_ID, THREAD_ID, '   '),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.doctorPatientThread.findUnique).not.toHaveBeenCalled();
  });

  it('sendMessage rejects with 403 when caller is not the patient on the thread', async () => {
    const prisma = makePrisma();
    prisma.doctorPatientThread.findUnique.mockResolvedValue({
      id: THREAD_ID,
      patientUserId: 'someone-else',
      doctor: doctorRow(),
    });
    const svc = await buildService(prisma);
    await expect(
      svc.sendMessage(PATIENT_ID, THREAD_ID, 'hello'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.doctorPatientMessage.create).not.toHaveBeenCalled();
  });

  it('sendMessage persists trimmed body and returns DTO with mine=true', async () => {
    const prisma = makePrisma();
    prisma.doctorPatientThread.findUnique.mockResolvedValue({
      id: THREAD_ID,
      patientUserId: PATIENT_ID,
      doctor: doctorRow(),
    });
    prisma.doctorPatientThread.update.mockResolvedValue({});
    prisma.doctorPatientMessage.create.mockResolvedValue({
      id: 'm-new',
      threadId: THREAD_ID,
      senderUserId: PATIENT_ID,
      body: 'hi doc',
      readAt: null,
      createdAt: new Date('2026-05-01T12:00:00Z'),
    });

    const svc = await buildService(prisma);
    const dto = await svc.sendMessage(PATIENT_ID, THREAD_ID, '  hi doc  ');

    expect(prisma.doctorPatientMessage.create).toHaveBeenCalledWith({
      data: { threadId: THREAD_ID, senderUserId: PATIENT_ID, body: 'hi doc' },
    });
    expect(dto).toMatchObject({
      id: 'm-new',
      sender: 'patient',
      mine: true,
      body: 'hi doc',
    });
  });
});
