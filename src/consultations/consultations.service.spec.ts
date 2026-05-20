import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  ConsultationBookingStatus,
  ConsultationRefundStatus,
  ConsultationType,
  OnboardingUserRole,
  Prisma,
  UserAppRole,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AvailabilityService } from '../availability/availability.service';
import { AccountAuditService } from '../me/account-audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ConsultationsService } from './consultations.service';

const PATIENT_ID = 'pat-1';
const DOCTOR_ID = 'doc-1';

const SLOT_AT = '2026-06-08T09:00:00.000Z';
const SLOT_END = '2026-06-08T09:30:00.000Z';

type BookingRow = {
  id: string;
  topDoctorId: string;
  consultationType: ConsultationType;
  status: ConsultationBookingStatus;
  consultationFeeCents: number;
  currency: string;
  patientNotes: string | null;
  paidAt: Date | null;
  chapaTxRef: string | null;
  scheduledFor: Date | null;
  durationMinutes: number;
  doctorDecisionReason: string | null;
  cancelReason: string | null;
  cancelledByUserId: string | null;
  refundStatus: ConsultationRefundStatus;
  meetingLink: string | null;
  meetingLinkSetAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  topDoctor: {
    email: string;
    profile: {
      preferredName: string;
      professionalProfile: unknown;
    } | null;
  };
};

function makeBookingRow(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: 'booking-1',
    topDoctorId: DOCTOR_ID,
    consultationType: ConsultationType.video,
    status: ConsultationBookingStatus.pending_payment,
    consultationFeeCents: 25000,
    currency: 'ETB',
    patientNotes: null,
    paidAt: null,
    chapaTxRef: null,
    scheduledFor: null,
    durationMinutes: 30,
    doctorDecisionReason: null,
    cancelReason: null,
    cancelledByUserId: null,
    refundStatus: ConsultationRefundStatus.none,
    meetingLink: null,
    meetingLinkSetAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    topDoctor: {
      email: 'doc@example.com',
      profile: {
        preferredName: 'Dr. Lemma',
        professionalProfile: { fullName: 'Dr. Lemma A.' },
      },
    },
    ...overrides,
  };
}

const baseDoctorProfile = {
  userId: DOCTOR_ID,
  preferredName: 'Dr. Lemma',
  professionalProfile: {
    fullName: 'Dr. Lemma A.',
    consultationFees: { video: 250, written: 150 },
  },
};

function makePrisma() {
  return {
    userProfile: {
      findUnique: jest.fn().mockResolvedValue({
        role: OnboardingUserRole.personal,
      }),
      findFirst: jest.fn().mockResolvedValue(baseDoctorProfile),
    },
    consultationBooking: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      create: jest
        .fn()
        .mockImplementation((args: Prisma.ConsultationBookingCreateArgs) => {
          const data =
            args.data as Prisma.ConsultationBookingUncheckedCreateInput;
          return Promise.resolve(
            makeBookingRow({
              consultationType: data.consultationType ?? ConsultationType.video,
              status: data.status ?? ConsultationBookingStatus.pending_payment,
              consultationFeeCents: data.consultationFeeCents,
              currency: data.currency ?? 'ETB',
              patientNotes: data.patientNotes ?? null,
              scheduledFor: (data.scheduledFor as Date | null) ?? null,
              durationMinutes: data.durationMinutes ?? 30,
            }),
          );
        }),
      update: jest
        .fn()
        .mockImplementation((args: Prisma.ConsultationBookingUpdateArgs) => {
          const data =
            args.data as Prisma.ConsultationBookingUncheckedUpdateInput;
          return Promise.resolve(
            makeBookingRow({
              status:
                (data.status as ConsultationBookingStatus | undefined) ??
                ConsultationBookingStatus.cancelled,
              cancelReason: (data.cancelReason as string | null) ?? null,
              cancelledByUserId:
                (data.cancelledByUserId as string | null) ?? null,
              refundStatus:
                (data.refundStatus as ConsultationRefundStatus | undefined) ??
                ConsultationRefundStatus.none,
              paidAt: new Date(),
            }),
          );
        }),
    },
  };
}

function makeAvailability() {
  return {
    computeSlots: jest.fn().mockResolvedValue({
      items: [{ startsAt: SLOT_AT, endsAt: SLOT_END }],
    }),
  };
}

async function build(
  prisma: ReturnType<typeof makePrisma>,
  availability: ReturnType<typeof makeAvailability> = makeAvailability(),
) {
  const mod = await Test.createTestingModule({
    // Phase 6 — stub notification + audit dependencies; the booking
    // lifecycle assertions in this file don't care whether the fan-out
    // fires, just that the state transitions are correct.
    providers: [
      ConsultationsService,
      { provide: PrismaService, useValue: prisma },
      { provide: ConfigService, useValue: { get: () => 'ETB' } },
      { provide: AvailabilityService, useValue: availability },
      {
        provide: NotificationsService,
        useValue: { enqueue: jest.fn(async () => undefined) },
      },
      {
        provide: AccountAuditService,
        useValue: { log: jest.fn(async () => undefined) },
      },
    ],
  }).compile();
  return { svc: mod.get(ConsultationsService), prisma, availability };
}

describe('ConsultationsService (Phase 3)', () => {
  beforeEach(() => {
    jest
      .useFakeTimers()
      .setSystemTime(new Date('2026-06-07T00:00:00.000Z').getTime());
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('createBooking — slot validation + spam quota', () => {
    it('rejects when patient already has the maximum pending bookings', async () => {
      const prisma = makePrisma();
      prisma.consultationBooking.count.mockResolvedValue(3);
      prisma.userProfile.findFirst.mockResolvedValue({
        userId: DOCTOR_ID,
        preferredName: 'Dr. Lemma',
        professionalProfile: { consultationFees: { video: 250 } },
      });

      const { svc } = await build(prisma);
      await expect(
        svc.createBooking(PATIENT_ID, UserAppRole.user, {
          topDoctorId: DOCTOR_ID,
          consultationType: ConsultationType.video,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a startsAt that is in the past', async () => {
      const prisma = makePrisma();
      prisma.userProfile.findFirst.mockResolvedValue({
        userId: DOCTOR_ID,
        preferredName: 'Dr. Lemma',
        professionalProfile: { consultationFees: { video: 250 } },
      });

      const { svc } = await build(prisma);
      await expect(
        svc.createBooking(PATIENT_ID, UserAppRole.user, {
          topDoctorId: DOCTOR_ID,
          consultationType: ConsultationType.video,
          startsAt: '2026-06-01T09:00:00.000Z',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a startsAt that does not match any computed slot', async () => {
      const prisma = makePrisma();
      prisma.userProfile.findFirst.mockResolvedValue({
        userId: DOCTOR_ID,
        preferredName: 'Dr. Lemma',
        professionalProfile: { consultationFees: { video: 250 } },
      });

      const availability = makeAvailability();
      availability.computeSlots.mockResolvedValue({
        items: [{ startsAt: SLOT_AT, endsAt: SLOT_END }],
      });

      const { svc } = await build(prisma, availability);
      await expect(
        svc.createBooking(PATIENT_ID, UserAppRole.user, {
          topDoctorId: DOCTOR_ID,
          consultationType: ConsultationType.video,
          startsAt: '2026-06-08T10:00:00.000Z',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('races: rejects when another booking already holds the same slot', async () => {
      const prisma = makePrisma();
      prisma.userProfile.findFirst.mockResolvedValue({
        userId: DOCTOR_ID,
        preferredName: 'Dr. Lemma',
        professionalProfile: { consultationFees: { video: 250 } },
      });
      prisma.consultationBooking.findFirst.mockResolvedValue({
        id: 'other-booking',
      });

      const { svc } = await build(prisma);
      await expect(
        svc.createBooking(PATIENT_ID, UserAppRole.user, {
          topDoctorId: DOCTOR_ID,
          consultationType: ConsultationType.video,
          startsAt: SLOT_AT,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('accepts a valid slot and persists scheduledFor + durationMinutes', async () => {
      const prisma = makePrisma();
      prisma.userProfile.findFirst.mockResolvedValue({
        userId: DOCTOR_ID,
        preferredName: 'Dr. Lemma',
        professionalProfile: { consultationFees: { video: 250 } },
      });

      const { svc } = await build(prisma);
      await svc.createBooking(PATIENT_ID, UserAppRole.user, {
        topDoctorId: DOCTOR_ID,
        consultationType: ConsultationType.video,
        startsAt: SLOT_AT,
      });

      const createMock = prisma.consultationBooking
        .create as unknown as jest.MockedFunction<
        (args: Prisma.ConsultationBookingCreateArgs) => Promise<unknown>
      >;
      const createArgs = createMock.mock.calls[0][0];
      const createdData =
        createArgs.data as Prisma.ConsultationBookingUncheckedCreateInput;
      expect(createdData.scheduledFor).toEqual(new Date(SLOT_AT));
      expect(createdData.durationMinutes).toBe(30);
      expect(createdData.status).toBe(
        ConsultationBookingStatus.pending_payment,
      );
    });
  });

  describe('cancelMyBooking', () => {
    it('404s when the booking belongs to another patient', async () => {
      const prisma = makePrisma();
      prisma.consultationBooking.findUnique.mockResolvedValue({
        id: 'b1',
        patientUserId: 'someone-else',
        status: ConsultationBookingStatus.pending_payment,
      });
      const { svc } = await build(prisma);
      await expect(
        svc.cancelMyBooking(PATIENT_ID, 'b1', {}),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects when the booking is already in a terminal state', async () => {
      const prisma = makePrisma();
      prisma.consultationBooking.findUnique.mockResolvedValue({
        id: 'b1',
        patientUserId: PATIENT_ID,
        status: ConsultationBookingStatus.completed,
      });
      const { svc } = await build(prisma);
      await expect(
        svc.cancelMyBooking(PATIENT_ID, 'b1', {}),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('moves a paid booking to refund_status=pending on cancel', async () => {
      const prisma = makePrisma();
      prisma.consultationBooking.findUnique.mockResolvedValue({
        id: 'b1',
        patientUserId: PATIENT_ID,
        status: ConsultationBookingStatus.pending_doctor_approval,
      });

      const { svc } = await build(prisma);
      const out = await svc.cancelMyBooking(PATIENT_ID, 'b1', {
        reason: 'changed my mind',
      });

      const updateMock = prisma.consultationBooking
        .update as unknown as jest.MockedFunction<
        (args: Prisma.ConsultationBookingUpdateArgs) => Promise<unknown>
      >;
      const updateArgs = updateMock.mock.calls[0][0];
      const updatedData =
        updateArgs.data as Prisma.ConsultationBookingUncheckedUpdateInput;
      expect(updatedData.status).toBe(ConsultationBookingStatus.cancelled);
      expect(updatedData.refundStatus).toBe(ConsultationRefundStatus.pending);
      expect(updatedData.cancelledByUserId).toBe(PATIENT_ID);
      expect(updatedData.cancelReason).toBe('changed my mind');
      expect(out.refundStatus).toBe(ConsultationRefundStatus.pending);
    });

    it('keeps refund_status=none when cancelling an unpaid booking', async () => {
      const prisma = makePrisma();
      prisma.consultationBooking.findUnique.mockResolvedValue({
        id: 'b1',
        patientUserId: PATIENT_ID,
        status: ConsultationBookingStatus.pending_payment,
      });

      const { svc } = await build(prisma);
      const out = await svc.cancelMyBooking(PATIENT_ID, 'b1', {});
      expect(out.refundStatus).toBe(ConsultationRefundStatus.none);
    });
  });

  describe('role guards', () => {
    it('rejects professional callers from creating a booking', async () => {
      const prisma = makePrisma();
      prisma.userProfile.findUnique.mockResolvedValue({
        role: OnboardingUserRole.professional,
      });
      const { svc } = await build(prisma);
      await expect(
        svc.createBooking(PATIENT_ID, UserAppRole.user, {
          topDoctorId: DOCTOR_ID,
          consultationType: ConsultationType.video,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('Phase 4 — consultation type expansion', () => {
    it('falls back to the video fee for in_person bookings when no in_person fee is set', async () => {
      const prisma = makePrisma();
      prisma.userProfile.findFirst.mockResolvedValue({
        userId: DOCTOR_ID,
        preferredName: 'Dr. Lemma',
        professionalProfile: { videoConsultationFee: 300 },
      });

      const { svc } = await build(prisma);
      await svc.createBooking(PATIENT_ID, UserAppRole.user, {
        topDoctorId: DOCTOR_ID,
        consultationType: ConsultationType.in_person,
      });

      const createMock = prisma.consultationBooking
        .create as unknown as jest.MockedFunction<
        (args: Prisma.ConsultationBookingCreateArgs) => Promise<unknown>
      >;
      const createdData = createMock.mock.calls[0][0]
        .data as Prisma.ConsultationBookingUncheckedCreateInput;
      expect(createdData.consultationType).toBe(ConsultationType.in_person);
      expect(createdData.consultationFeeCents).toBe(30000);
    });

    it('hybrid takes max(video, written) when no hybrid-specific fee exists', async () => {
      const prisma = makePrisma();
      prisma.userProfile.findFirst.mockResolvedValue({
        userId: DOCTOR_ID,
        preferredName: 'Dr. Lemma',
        professionalProfile: {
          videoConsultationFee: 200,
          writtenConsultationFee: 350,
        },
      });

      const { svc } = await build(prisma);
      await svc.createBooking(PATIENT_ID, UserAppRole.user, {
        topDoctorId: DOCTOR_ID,
        consultationType: ConsultationType.hybrid,
      });

      const createMock = prisma.consultationBooking
        .create as unknown as jest.MockedFunction<
        (args: Prisma.ConsultationBookingCreateArgs) => Promise<unknown>
      >;
      const createdData = createMock.mock.calls[0][0]
        .data as Prisma.ConsultationBookingUncheckedCreateInput;
      expect(createdData.consultationFeeCents).toBe(35000);
    });

    it('rejects in_person bookings when the doctor has no fees at all', async () => {
      const prisma = makePrisma();
      prisma.userProfile.findFirst.mockResolvedValue({
        userId: DOCTOR_ID,
        preferredName: 'Dr. Lemma',
        professionalProfile: {},
      });

      const { svc } = await build(prisma);
      await expect(
        svc.createBooking(PATIENT_ID, UserAppRole.user, {
          topDoctorId: DOCTOR_ID,
          consultationType: ConsultationType.in_person,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('Phase 4 — meeting link visibility', () => {
    it('hides meetingLink from the patient before the doctor approves', async () => {
      const prisma = makePrisma();
      prisma.consultationBooking.findUnique.mockResolvedValue({
        ...makeBookingRow({
          status: ConsultationBookingStatus.pending_doctor_approval,
          meetingLink: 'https://meet.example.com/should-be-hidden',
          meetingLinkSetAt: new Date('2026-06-08T08:00:00.000Z'),
        }),
        patientUserId: PATIENT_ID,
      });

      const { svc } = await build(prisma);
      const out = await svc.getBookingById(
        PATIENT_ID,
        UserAppRole.user,
        'b1',
      );
      // Even though the row has a value, the wire response masks it
      // until the booking has been doctor-approved.
      expect(out.meetingLink).toBeNull();
      expect(out.meetingLinkSetAt).toBeNull();
    });

    it('surfaces meetingLink once the booking is approved', async () => {
      const prisma = makePrisma();
      const setAt = new Date('2026-06-08T08:00:00.000Z');
      prisma.consultationBooking.findUnique.mockResolvedValue({
        ...makeBookingRow({
          status: ConsultationBookingStatus.approved,
          meetingLink: 'https://meet.example.com/xyz',
          meetingLinkSetAt: setAt,
        }),
        patientUserId: PATIENT_ID,
      });

      const { svc } = await build(prisma);
      const out = await svc.getBookingById(
        PATIENT_ID,
        UserAppRole.user,
        'b1',
      );
      expect(out.meetingLink).toBe('https://meet.example.com/xyz');
      expect(out.meetingLinkSetAt).toBe(setAt.toISOString());
    });
  });
});
