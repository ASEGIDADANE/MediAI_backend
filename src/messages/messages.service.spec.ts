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
    // Phase 4 chat-gating: `sendMessage` looks up booking candidates and
    // then a JS time-window helper decides whether to allow the send.
    // Default: one approved booking with a future slot — i.e. window open.
    consultationBooking: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'booking-1',
          status: 'approved',
          scheduledFor: new Date(Date.now() + 60 * 60 * 1000),
          durationMinutes: 30,
          completedAt: null,
          createdAt: new Date(),
        },
      ]),
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

  it('listThreads (doctor) filters by doctorUserId AND requires an active booking with each patient', async () => {
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

    // Mapping the result still works as before…
    expect(out.items[0]).toMatchObject({
      threadId: THREAD_ID,
      doctorUserId: DOCTOR_ID,
      patientUserId: PATIENT_ID,
      patientName: 'Kiyar Ali',
      lastMessageSender: 'doctor',
    });

    // …but the where-clause must now include the relationship gate. We
    // assert on its shape via serialization to keep this resilient to small
    // refactors of the literal.
    const call = prisma.doctorPatientThread.findMany.mock.calls[0][0] as {
      where: unknown;
    };
    const flat = JSON.stringify(call.where);
    expect(flat).toContain(DOCTOR_ID);
    expect(flat).toContain('consultationBookings');
    // Phase 4 — chat is gated to approved/completed/legacy-confirmed only.
    // `paid` (transient post-payment, pre-doctor-decision) is deliberately
    // excluded so a patient can't message a doctor before approval.
    expect(flat).toContain('approved');
    expect(flat).toContain('confirmed');
    expect(flat).not.toContain('"paid"');
  });

  it('getUnreadCount (doctor) excludes threads with no active booking from the badge total', async () => {
    const prisma = makePrisma();
    prisma.userProfile.findUnique.mockResolvedValue({
      role: 'professional',
    });
    prisma.doctorPatientMessage.count.mockResolvedValue(7);

    const svc = await buildService(prisma);
    const out = await svc.getUnreadCount(DOCTOR_ID);
    expect(out).toEqual({ count: 7 });

    // The count query must be gated by the same booking filter as the inbox,
    // so the navbar badge can't disagree with the thread list.
    const call = prisma.doctorPatientMessage.count.mock.calls[0][0] as {
      where: unknown;
    };
    const flat = JSON.stringify(call.where);
    expect(flat).toContain('consultationBookings');
    expect(flat).toContain('approved');
    expect(flat).not.toContain('"paid"');
  });

  it('getUnreadCount (patient) is NOT gated by bookings — patients keep full visibility', async () => {
    const prisma = makePrisma();
    prisma.userProfile.findUnique.mockResolvedValue({ role: 'personal' });
    prisma.doctorPatientMessage.count.mockResolvedValue(3);

    const svc = await buildService(prisma);
    const out = await svc.getUnreadCount(PATIENT_ID);
    expect(out).toEqual({ count: 3 });

    expect(prisma.doctorPatientMessage.count).toHaveBeenCalledWith({
      where: {
        readAt: null,
        NOT: { senderUserId: PATIENT_ID },
        thread: { patientUserId: PATIENT_ID },
      },
    });
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
      doctorUserId: DOCTOR_ID,
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

    // Phase 4 — chat-gating: the service must look up bookings with this
    // specific doctor and confirm the consultation window is open before
    // letting the message land.
    expect(prisma.consultationBooking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          patientUserId: PATIENT_ID,
          topDoctorId: DOCTOR_ID,
          status: expect.objectContaining({
            in: expect.arrayContaining(['approved']),
          }),
        }),
      }),
    );

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

  it('sendMessage rejects with 403 when there is no doctor-approved booking', async () => {
    const prisma = makePrisma();
    prisma.doctorPatientThread.findUnique.mockResolvedValue({
      id: THREAD_ID,
      patientUserId: PATIENT_ID,
      doctorUserId: DOCTOR_ID,
      doctor: doctorRow(),
    });
    // No bookings at all — chat gate must trip.
    prisma.consultationBooking.findMany.mockResolvedValue([]);

    const svc = await buildService(prisma);
    await expect(
      svc.sendMessage(PATIENT_ID, THREAD_ID, 'hello'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // We never reached the actual insert.
    expect(prisma.doctorPatientMessage.create).not.toHaveBeenCalled();
    expect(prisma.doctorPatientThread.update).not.toHaveBeenCalled();
  });

  it('sendMessage rejects with 403 when the booking exists but its consultation window has expired', async () => {
    const prisma = makePrisma();
    prisma.doctorPatientThread.findUnique.mockResolvedValue({
      id: THREAD_ID,
      patientUserId: PATIENT_ID,
      doctorUserId: DOCTOR_ID,
      doctor: doctorRow(),
    });
    // Completed booking, but the 24h post-completion grace has long passed.
    prisma.consultationBooking.findMany.mockResolvedValue([
      {
        id: 'booking-old',
        status: 'completed',
        scheduledFor: new Date('2025-01-01T09:00:00Z'),
        durationMinutes: 30,
        completedAt: new Date('2025-01-01T09:30:00Z'),
        createdAt: new Date('2024-12-25T10:00:00Z'),
      },
    ]);

    const svc = await buildService(prisma);
    await expect(
      svc.sendMessage(PATIENT_ID, THREAD_ID, 'hello'),
    ).rejects.toThrow(/book a follow-up/i);
    expect(prisma.doctorPatientMessage.create).not.toHaveBeenCalled();
  });

  it('getThread returns chatWindowEndsAt computed from the latest active booking', async () => {
    const prisma = makePrisma();
    prisma.doctorPatientThread.findUnique.mockResolvedValue({
      id: THREAD_ID,
      patientUserId: PATIENT_ID,
      doctorUserId: DOCTOR_ID,
      doctor: doctorRow(),
    });
    const futureSlot = new Date(Date.now() + 2 * 60 * 60 * 1000);
    prisma.consultationBooking.findMany.mockResolvedValue([
      {
        id: 'booking-future',
        status: 'approved',
        scheduledFor: futureSlot,
        durationMinutes: 30,
        completedAt: null,
        createdAt: new Date(),
      },
    ]);

    const svc = await buildService(prisma);
    const detail = await svc.getThread(PATIENT_ID, THREAD_ID, 10);
    // Window closes at slot_end + 30 min.
    const expectedClose = new Date(
      futureSlot.getTime() + 30 * 60 * 1000 + 30 * 60 * 1000,
    ).toISOString();
    expect(detail.chatWindowEndsAt).toBe(expectedClose);
  });

  it('getThread exposes chatWindowEndsAt=null when no booking is active', async () => {
    const prisma = makePrisma();
    prisma.doctorPatientThread.findUnique.mockResolvedValue({
      id: THREAD_ID,
      patientUserId: PATIENT_ID,
      doctorUserId: DOCTOR_ID,
      doctor: doctorRow(),
    });
    prisma.consultationBooking.findMany.mockResolvedValue([]);
    const svc = await buildService(prisma);
    const detail = await svc.getThread(PATIENT_ID, THREAD_ID, 10);
    expect(detail.chatWindowEndsAt).toBeNull();
  });
});
