import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ConsultationBookingStatus,
  ConsultationRefundStatus,
  ConsultationType,
  OnboardingUserRole,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountAuditService } from '../me/account-audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ProfessionalBookingsService } from './professional-bookings.service';

const DOCTOR_ID = 'doc-1';
const OTHER_DOCTOR = 'doc-2';

type Row = {
  id: string;
  topDoctorId: string;
  status: ConsultationBookingStatus;
  consultationType: ConsultationType;
  consultationFeeCents: number;
  currency: string;
  patientNotes: string | null;
  scheduledFor: Date | null;
  durationMinutes: number;
  paidAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  completedAt: Date | null;
  missedAt: Date | null;
  cancelledAt: Date | null;
  doctorDecisionReason: string | null;
  cancelReason: string | null;
  cancelledByUserId: string | null;
  refundStatus: ConsultationRefundStatus;
  meetingLink: string | null;
  meetingLinkSetAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  patient: {
    id: string;
    email: string;
    profile: { preferredName: string } | null;
  };
};

function makeBookingRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 'booking-1',
    topDoctorId: DOCTOR_ID,
    status: ConsultationBookingStatus.pending_doctor_approval,
    consultationType: ConsultationType.video,
    consultationFeeCents: 25000,
    currency: 'ETB',
    patientNotes: null,
    scheduledFor: new Date('2026-06-08T09:00:00.000Z'),
    durationMinutes: 30,
    paidAt: new Date('2026-06-07T20:00:00.000Z'),
    approvedAt: null,
    rejectedAt: null,
    completedAt: null,
    missedAt: null,
    cancelledAt: null,
    doctorDecisionReason: null,
    cancelReason: null,
    cancelledByUserId: null,
    refundStatus: ConsultationRefundStatus.none,
    meetingLink: null,
    meetingLinkSetAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    patient: {
      id: 'pat-1',
      email: 'pat@example.com',
      profile: { preferredName: 'Pat A.' },
    },
    ...overrides,
  };
}

function makePrisma() {
  return {
    userProfile: {
      findUnique: jest.fn().mockResolvedValue({
        role: OnboardingUserRole.professional,
      }),
    },
    consultationBooking: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest
        .fn()
        .mockImplementation((args: Prisma.ConsultationBookingUpdateArgs) => {
          const data =
            args.data as Prisma.ConsultationBookingUncheckedUpdateInput;
          const id = args.where.id ?? 'booking-1';
          return Promise.resolve(
            makeBookingRow({
              id,
              status:
                (data.status as ConsultationBookingStatus | undefined) ??
                ConsultationBookingStatus.approved,
              refundStatus:
                (data.refundStatus as ConsultationRefundStatus | undefined) ??
                ConsultationRefundStatus.none,
            }),
          );
        }),
    },
  };
}

async function build(prisma: ReturnType<typeof makePrisma>) {
  // Phase 6 — `ProfessionalBookingsService` now depends on
  // `NotificationsService` and `AccountAuditService` for the post-transition
  // fan-out (in-app notification, email, audit log). Existing tests only
  // care about the state-machine logic, so we wire stubs that no-op on
  // every call rather than dragging the full modules into the test bed.
  const notifications = { enqueue: jest.fn(async () => undefined) };
  const audit = { log: jest.fn(async () => undefined) };
  const mod = await Test.createTestingModule({
    providers: [
      ProfessionalBookingsService,
      { provide: PrismaService, useValue: prisma },
      { provide: NotificationsService, useValue: notifications },
      { provide: AccountAuditService, useValue: audit },
    ],
  }).compile();
  return {
    svc: mod.get(ProfessionalBookingsService),
    prisma,
    notifications,
    audit,
  };
}

describe('ProfessionalBookingsService', () => {
  describe('role guard', () => {
    it('rejects non-professional callers', async () => {
      const prisma = makePrisma();
      prisma.userProfile.findUnique.mockResolvedValue({
        role: OnboardingUserRole.personal,
      });
      const { svc } = await build(prisma);
      await expect(svc.listBookingRequests(DOCTOR_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('listBookingRequests', () => {
    it('filters by doctor + pending_doctor_approval and sorts by scheduledFor ASC', async () => {
      const prisma = makePrisma();
      const { svc } = await build(prisma);
      await svc.listBookingRequests(DOCTOR_ID);
      expect(prisma.consultationBooking.findMany).toHaveBeenCalledWith({
        where: {
          topDoctorId: DOCTOR_ID,
          status: { in: [ConsultationBookingStatus.pending_doctor_approval] },
        },
        orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'asc' }],
        include: expect.any(Object) as unknown,
      });
    });
  });

  describe('listAppointments', () => {
    it('returns only doctor-scheduled statuses ordered by scheduledFor DESC', async () => {
      const prisma = makePrisma();
      const { svc } = await build(prisma);
      await svc.listAppointments(DOCTOR_ID);
      const findManyMock = prisma.consultationBooking
        .findMany as unknown as jest.MockedFunction<
        (args: Prisma.ConsultationBookingFindManyArgs) => Promise<unknown[]>
      >;
      const findManyArgs = findManyMock.mock.calls[0][0];
      const where =
        findManyArgs.where as Prisma.ConsultationBookingWhereInput & {
          status: { in: ConsultationBookingStatus[] };
        };
      expect(where.topDoctorId).toBe(DOCTOR_ID);
      expect(where.status.in).toEqual(
        expect.arrayContaining([
          ConsultationBookingStatus.approved,
          ConsultationBookingStatus.completed,
          ConsultationBookingStatus.missed,
          ConsultationBookingStatus.confirmed,
        ]),
      );
      expect(findManyArgs.orderBy).toEqual([
        { scheduledFor: 'desc' },
        { createdAt: 'desc' },
      ]);
    });
  });

  function captureUpdate(prisma: ReturnType<typeof makePrisma>) {
    const updateMock = prisma.consultationBooking
      .update as unknown as jest.MockedFunction<
      (args: Prisma.ConsultationBookingUpdateArgs) => Promise<unknown>
    >;
    const args = updateMock.mock.calls[0][0];
    return args.data as Prisma.ConsultationBookingUncheckedUpdateInput;
  }

  describe('approve', () => {
    it('approves a pending_doctor_approval booking and stamps approvedAt', async () => {
      const prisma = makePrisma();
      prisma.consultationBooking.findUnique.mockResolvedValue(
        makeBookingRow({
          status: ConsultationBookingStatus.pending_doctor_approval,
        }),
      );
      const { svc } = await build(prisma);
      await svc.approve(DOCTOR_ID, 'booking-1');
      const data = captureUpdate(prisma);
      expect(data.status).toBe(ConsultationBookingStatus.approved);
      expect(data.approvedAt).toBeInstanceOf(Date);
    });

    it('404s when the booking belongs to a different doctor', async () => {
      const prisma = makePrisma();
      prisma.consultationBooking.findUnique.mockResolvedValue(
        makeBookingRow({ topDoctorId: OTHER_DOCTOR }),
      );
      const { svc } = await build(prisma);
      await expect(svc.approve(DOCTOR_ID, 'booking-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('refuses to approve a booking that is already approved', async () => {
      const prisma = makePrisma();
      prisma.consultationBooking.findUnique.mockResolvedValue(
        makeBookingRow({ status: ConsultationBookingStatus.approved }),
      );
      const { svc } = await build(prisma);
      await expect(svc.approve(DOCTOR_ID, 'booking-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('persists the meetingLink when supplied at approval time', async () => {
      const prisma = makePrisma();
      prisma.consultationBooking.findUnique.mockResolvedValue(
        makeBookingRow({
          status: ConsultationBookingStatus.pending_doctor_approval,
        }),
      );
      const { svc } = await build(prisma);
      await svc.approve(DOCTOR_ID, 'booking-1', {
        meetingLink: '  https://meet.example.com/abc-xyz  ',
      });
      const data = captureUpdate(prisma);
      expect(data.status).toBe(ConsultationBookingStatus.approved);
      expect(data.meetingLink).toBe('https://meet.example.com/abc-xyz');
      expect(data.meetingLinkSetAt).toBeInstanceOf(Date);
    });

    it('approving without a meetingLink does NOT touch meetingLink* columns', async () => {
      const prisma = makePrisma();
      prisma.consultationBooking.findUnique.mockResolvedValue(
        makeBookingRow({
          status: ConsultationBookingStatus.pending_doctor_approval,
        }),
      );
      const { svc } = await build(prisma);
      await svc.approve(DOCTOR_ID, 'booking-1');
      const data = captureUpdate(prisma);
      expect(data.meetingLink).toBeUndefined();
      expect(data.meetingLinkSetAt).toBeUndefined();
    });
  });

  describe('setMeetingLink', () => {
    it('sets a meeting link on an approved booking', async () => {
      const prisma = makePrisma();
      prisma.consultationBooking.findUnique.mockResolvedValue(
        makeBookingRow({ status: ConsultationBookingStatus.approved }),
      );
      const { svc } = await build(prisma);
      await svc.setMeetingLink(
        DOCTOR_ID,
        'booking-1',
        'https://meet.example.com/zzz',
      );
      const data = captureUpdate(prisma);
      expect(data.meetingLink).toBe('https://meet.example.com/zzz');
      expect(data.meetingLinkSetAt).toBeInstanceOf(Date);
    });

    it('clears the link when passed an empty string', async () => {
      const prisma = makePrisma();
      prisma.consultationBooking.findUnique.mockResolvedValue(
        makeBookingRow({
          status: ConsultationBookingStatus.approved,
          meetingLink: 'https://meet.example.com/old',
        }),
      );
      const { svc } = await build(prisma);
      await svc.setMeetingLink(DOCTOR_ID, 'booking-1', '   ');
      const data = captureUpdate(prisma);
      expect(data.meetingLink).toBeNull();
    });

    it('rejects non-http(s) URLs', async () => {
      const prisma = makePrisma();
      const { svc } = await build(prisma);
      await expect(
        svc.setMeetingLink(DOCTOR_ID, 'booking-1', 'not a url'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to set a link on a booking still awaiting decision', async () => {
      const prisma = makePrisma();
      prisma.consultationBooking.findUnique.mockResolvedValue(
        makeBookingRow({
          status: ConsultationBookingStatus.pending_doctor_approval,
        }),
      );
      const { svc } = await build(prisma);
      await expect(
        svc.setMeetingLink(
          DOCTOR_ID,
          'booking-1',
          'https://meet.example.com/x',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('404s when the booking belongs to a different doctor', async () => {
      const prisma = makePrisma();
      prisma.consultationBooking.findUnique.mockResolvedValue(
        makeBookingRow({
          status: ConsultationBookingStatus.approved,
          topDoctorId: OTHER_DOCTOR,
        }),
      );
      const { svc } = await build(prisma);
      await expect(
        svc.setMeetingLink(
          DOCTOR_ID,
          'booking-1',
          'https://meet.example.com/x',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('reject', () => {
    it('requires a non-empty reason', async () => {
      const prisma = makePrisma();
      const { svc } = await build(prisma);
      await expect(
        svc.reject(DOCTOR_ID, 'booking-1', '   '),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects + sets refund_status=pending for a paid booking', async () => {
      const prisma = makePrisma();
      prisma.consultationBooking.findUnique.mockResolvedValue(
        makeBookingRow({
          status: ConsultationBookingStatus.pending_doctor_approval,
        }),
      );
      const { svc } = await build(prisma);
      await svc.reject(DOCTOR_ID, 'booking-1', 'overbooked this week');
      const data = captureUpdate(prisma);
      expect(data.status).toBe(ConsultationBookingStatus.rejected);
      expect(data.doctorDecisionReason).toBe('overbooked this week');
      expect(data.rejectedAt).toBeInstanceOf(Date);
      expect(data.refundStatus).toBe(ConsultationRefundStatus.pending);
    });
  });

  describe('cancel', () => {
    it('refuses to cancel a pending_doctor_approval booking (use reject instead)', async () => {
      const prisma = makePrisma();
      prisma.consultationBooking.findUnique.mockResolvedValue(
        makeBookingRow({
          status: ConsultationBookingStatus.pending_doctor_approval,
        }),
      );
      const { svc } = await build(prisma);
      await expect(
        svc.cancel(DOCTOR_ID, 'booking-1', ''),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('cancels an approved booking, stamps cancelled fields, moves refund to pending', async () => {
      const prisma = makePrisma();
      prisma.consultationBooking.findUnique.mockResolvedValue(
        makeBookingRow({ status: ConsultationBookingStatus.approved }),
      );
      const { svc } = await build(prisma);
      await svc.cancel(DOCTOR_ID, 'booking-1', 'emergency');
      const data = captureUpdate(prisma);
      expect(data.status).toBe(ConsultationBookingStatus.cancelled);
      expect(data.cancelledByUserId).toBe(DOCTOR_ID);
      expect(data.cancelReason).toBe('emergency');
      expect(data.cancelledAt).toBeInstanceOf(Date);
      expect(data.refundStatus).toBe(ConsultationRefundStatus.pending);
    });
  });

  describe('markCompleted / markMissed', () => {
    it('completes an approved booking', async () => {
      const prisma = makePrisma();
      prisma.consultationBooking.findUnique.mockResolvedValue(
        makeBookingRow({ status: ConsultationBookingStatus.approved }),
      );
      const { svc } = await build(prisma);
      await svc.markCompleted(DOCTOR_ID, 'booking-1');
      const data = captureUpdate(prisma);
      expect(data.status).toBe(ConsultationBookingStatus.completed);
      expect(data.completedAt).toBeInstanceOf(Date);
    });

    it('marks an approved booking missed without refund handling', async () => {
      const prisma = makePrisma();
      prisma.consultationBooking.findUnique.mockResolvedValue(
        makeBookingRow({ status: ConsultationBookingStatus.approved }),
      );
      const { svc } = await build(prisma);
      await svc.markMissed(DOCTOR_ID, 'booking-1');
      const data = captureUpdate(prisma);
      expect(data.status).toBe(ConsultationBookingStatus.missed);
      expect(data.refundStatus).toBeUndefined();
    });

    it('refuses to complete a pending_doctor_approval booking', async () => {
      const prisma = makePrisma();
      prisma.consultationBooking.findUnique.mockResolvedValue(
        makeBookingRow({
          status: ConsultationBookingStatus.pending_doctor_approval,
        }),
      );
      const { svc } = await build(prisma);
      await expect(
        svc.markCompleted(DOCTOR_ID, 'booking-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // -------------------------------------------------------------------
  // Phase 6 — booking-lifecycle side effects (notifications + audit)
  // -------------------------------------------------------------------
  describe('lifecycle side-effects', () => {
    async function flushFireAndForget() {
      // `notifyAfterTransition` is fire-and-forget — awaiting it inside
      // the service implementation would block transition latency. Flush
      // a few microtasks so the inner `audit.log` + `notifications.enqueue`
      // calls have resolved before we assert against them.
      for (let i = 0; i < 5; i += 1) await Promise.resolve();
    }

    it('approve() audits and notifies the patient', async () => {
      const prisma = makePrisma();
      prisma.consultationBooking.findUnique.mockResolvedValue(
        makeBookingRow({
          status: ConsultationBookingStatus.pending_doctor_approval,
        }),
      );
      // Doctor lookup for preferredName.
      prisma.userProfile.findUnique
        .mockResolvedValueOnce({ role: OnboardingUserRole.professional })
        .mockResolvedValueOnce({ preferredName: 'Dr. Ayele' });

      const { svc, notifications, audit } = await build(prisma);
      await svc.approve(DOCTOR_ID, 'booking-1');
      await flushFireAndForget();

      expect(audit.log).toHaveBeenCalledTimes(1);
      const [auditedUser, auditedAction] = audit.log.mock.calls[0];
      expect(auditedUser).toBe(DOCTOR_ID);
      expect(String(auditedAction)).toBe('appointment_approved');

      expect(notifications.enqueue).toHaveBeenCalledTimes(1);
      const payload = notifications.enqueue.mock.calls[0][0];
      expect(payload.type).toBe('booking_approved');
      expect(payload.userId).not.toBe(DOCTOR_ID);
      expect(payload.body).toMatch(/Dr\. Ayele/);
      expect(payload.channels).toEqual(['inApp', 'email']);
    });

    it('reject() audits + notifies + redacts long reasons in the copy', async () => {
      const prisma = makePrisma();
      prisma.consultationBooking.findUnique.mockResolvedValue(
        makeBookingRow({
          status: ConsultationBookingStatus.pending_doctor_approval,
        }),
      );
      prisma.userProfile.findUnique
        .mockResolvedValueOnce({ role: OnboardingUserRole.professional })
        .mockResolvedValueOnce({ preferredName: 'Dr. Ayele' });

      const longReason = 'x'.repeat(500);
      const { svc, notifications, audit } = await build(prisma);
      await svc.reject(DOCTOR_ID, 'booking-1', longReason);
      await flushFireAndForget();

      expect(audit.log.mock.calls[0][1]).toBe('appointment_rejected' as never);
      const payload = notifications.enqueue.mock.calls[0][0];
      expect(payload.type).toBe('booking_rejected');
      // The copy should be truncated; never 500+ chars verbatim.
      expect(payload.body.length).toBeLessThan(longReason.length);
    });

    it('cancel() audits + notifies', async () => {
      const prisma = makePrisma();
      prisma.consultationBooking.findUnique.mockResolvedValue(
        makeBookingRow({
          status: ConsultationBookingStatus.approved,
        }),
      );
      prisma.userProfile.findUnique
        .mockResolvedValueOnce({ role: OnboardingUserRole.professional })
        .mockResolvedValueOnce({ preferredName: 'Dr. Ayele' });

      const { svc, notifications, audit } = await build(prisma);
      await svc.cancel(DOCTOR_ID, 'booking-1', 'family emergency');
      await flushFireAndForget();

      expect(audit.log.mock.calls[0][1]).toBe('appointment_cancelled' as never);
      const payload = notifications.enqueue.mock.calls[0][0];
      expect(payload.type).toBe('booking_cancelled');
    });

    it('markCompleted() audits + notifies (in-app only)', async () => {
      const prisma = makePrisma();
      prisma.consultationBooking.findUnique.mockResolvedValue(
        makeBookingRow({ status: ConsultationBookingStatus.approved }),
      );
      prisma.userProfile.findUnique
        .mockResolvedValueOnce({ role: OnboardingUserRole.professional })
        .mockResolvedValueOnce({ preferredName: 'Dr. Ayele' });

      const { svc, notifications, audit } = await build(prisma);
      await svc.markCompleted(DOCTOR_ID, 'booking-1');
      await flushFireAndForget();

      expect(audit.log.mock.calls[0][1]).toBe('appointment_completed' as never);
      const payload = notifications.enqueue.mock.calls[0][0];
      expect(payload.type).toBe('booking_completed');
      expect(payload.channels).toEqual(['inApp']);
    });

    it('setMeetingLink() with a URL audits + notifies the patient', async () => {
      const prisma = makePrisma();
      prisma.consultationBooking.findUnique.mockResolvedValue(
        makeBookingRow({ status: ConsultationBookingStatus.approved }),
      );
      prisma.userProfile.findUnique
        .mockResolvedValueOnce({ role: OnboardingUserRole.professional })
        .mockResolvedValueOnce({ preferredName: 'Dr. Ayele' });

      const { svc, notifications, audit } = await build(prisma);
      await svc.setMeetingLink(
        DOCTOR_ID,
        'booking-1',
        'https://meet.example.com/xyz',
      );
      await flushFireAndForget();

      expect(audit.log.mock.calls[0][1]).toBe('meeting_link_set' as never);
      const payload = notifications.enqueue.mock.calls[0][0];
      expect(payload.type).toBe('meeting_link_set');
    });

    it('setMeetingLink("") audits the clear but does NOT notify the patient', async () => {
      const prisma = makePrisma();
      prisma.consultationBooking.findUnique.mockResolvedValue(
        makeBookingRow({
          status: ConsultationBookingStatus.approved,
          meetingLink: 'https://meet.example.com/old',
        }),
      );
      prisma.userProfile.findUnique
        .mockResolvedValueOnce({ role: OnboardingUserRole.professional })
        .mockResolvedValueOnce({ preferredName: 'Dr. Ayele' });

      const { svc, notifications, audit } = await build(prisma);
      await svc.setMeetingLink(DOCTOR_ID, 'booking-1', '   ');
      await flushFireAndForget();

      expect(audit.log).toHaveBeenCalledTimes(1);
      expect(notifications.enqueue).not.toHaveBeenCalled();
    });
  });
});
