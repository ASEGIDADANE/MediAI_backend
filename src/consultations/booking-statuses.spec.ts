import { ConsultationBookingStatus } from '../generated/prisma/client';
import {
  bookingChatWindowEndsAt,
  isBookingChatActive,
  POST_COMPLETION_GRACE_MS,
  SLOT_END_GRACE_MS,
} from './booking-statuses';

const HOUR = 60 * 60 * 1000;

function row(
  overrides: Partial<{
    status: ConsultationBookingStatus;
    scheduledFor: Date | null;
    durationMinutes: number;
    completedAt: Date | null;
    createdAt: Date;
  }> = {},
) {
  return {
    status: ConsultationBookingStatus.approved,
    scheduledFor: new Date('2026-06-08T09:00:00.000Z'),
    durationMinutes: 30,
    completedAt: null,
    createdAt: new Date('2026-06-07T20:00:00.000Z'),
    ...overrides,
  };
}

describe('booking-statuses — Phase 4 consultation window', () => {
  describe('bookingChatWindowEndsAt', () => {
    it('approved + slot scheduled → slot end + 30 min grace', () => {
      const endsAt = bookingChatWindowEndsAt(row());
      expect(endsAt?.toISOString()).toBe('2026-06-08T10:00:00.000Z');
    });

    it('approved without a slot → falls back to created + 24h', () => {
      const endsAt = bookingChatWindowEndsAt(row({ scheduledFor: null }));
      // createdAt = 2026-06-07T20:00:00Z + 24h = 2026-06-08T20:00:00Z
      expect(endsAt?.toISOString()).toBe('2026-06-08T20:00:00.000Z');
    });

    it('completed → completedAt + 24h grace', () => {
      const endsAt = bookingChatWindowEndsAt(
        row({
          status: ConsultationBookingStatus.completed,
          completedAt: new Date('2026-06-08T09:30:00.000Z'),
        }),
      );
      expect(endsAt?.toISOString()).toBe('2026-06-09T09:30:00.000Z');
    });

    it('legacy confirmed with slot uses slot-end + grace', () => {
      const endsAt = bookingChatWindowEndsAt(
        row({ status: ConsultationBookingStatus.confirmed }),
      );
      expect(endsAt?.toISOString()).toBe('2026-06-08T10:00:00.000Z');
    });

    it.each([
      ConsultationBookingStatus.pending_payment,
      ConsultationBookingStatus.paid,
      ConsultationBookingStatus.pending_doctor_approval,
      ConsultationBookingStatus.rejected,
      ConsultationBookingStatus.cancelled,
      ConsultationBookingStatus.missed,
      ConsultationBookingStatus.failed,
    ])('returns null for status=%s', (status) => {
      expect(bookingChatWindowEndsAt(row({ status }))).toBeNull();
    });
  });

  describe('isBookingChatActive', () => {
    const slotEnd = new Date('2026-06-08T09:30:00.000Z');

    it('approved + just after slot end but inside grace → active', () => {
      const now = new Date(slotEnd.getTime() + 10 * 60 * 1000);
      expect(isBookingChatActive(row(), now)).toBe(true);
    });

    it('approved + exactly at slot end + grace → inactive', () => {
      const now = new Date(slotEnd.getTime() + SLOT_END_GRACE_MS);
      expect(isBookingChatActive(row(), now)).toBe(false);
    });

    it('approved + slot scheduled in the future → active (pre-consult Qs allowed)', () => {
      const before = new Date('2026-06-07T22:00:00.000Z');
      expect(isBookingChatActive(row(), before)).toBe(true);
    });

    it('completed within 24h → active', () => {
      const completedAt = new Date('2026-06-08T09:30:00.000Z');
      const now = new Date(completedAt.getTime() + 6 * HOUR);
      expect(
        isBookingChatActive(
          row({
            status: ConsultationBookingStatus.completed,
            completedAt,
          }),
          now,
        ),
      ).toBe(true);
    });

    it('completed past 24h → inactive (must book follow-up)', () => {
      const completedAt = new Date('2026-06-08T09:30:00.000Z');
      const now = new Date(completedAt.getTime() + POST_COMPLETION_GRACE_MS + 1);
      expect(
        isBookingChatActive(
          row({
            status: ConsultationBookingStatus.completed,
            completedAt,
          }),
          now,
        ),
      ).toBe(false);
    });

    it('rejected is never chat-active regardless of timing', () => {
      const now = new Date('2026-06-08T08:00:00.000Z');
      expect(
        isBookingChatActive(
          row({ status: ConsultationBookingStatus.rejected }),
          now,
        ),
      ).toBe(false);
    });

    it('pending_doctor_approval is never chat-active', () => {
      const now = new Date('2026-06-08T08:00:00.000Z');
      expect(
        isBookingChatActive(
          row({ status: ConsultationBookingStatus.pending_doctor_approval }),
          now,
        ),
      ).toBe(false);
    });
  });
});
