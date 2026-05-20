import { ConsultationBookingStatus } from '../generated/prisma/client';

/**
 * Single source of truth for "how each module should group booking statuses".
 *
 * Phase 3 expanded `ConsultationBookingStatus` from five values to ten. Rather
 * than have each consumer hard-code its own subset (and inevitably drift),
 * every consumer imports the relevant constant from here and Phase-4/5/6 work
 * just edits this file once.
 *
 * Why each group exists:
 *
 *   * `SLOT_HOLDING_STATUSES` — a booking in any of these statuses occupies
 *     a slot. `AvailabilityService.computeSlots` subtracts overlapping
 *     bookings in this set. Cancelled/rejected/failed bookings free the
 *     slot back up.
 *
 *   * `ACTIVE_DOCTOR_PATIENT_RELATIONSHIP_STATUSES` — what makes a patient
 *     "this doctor's patient" for the Phase 1 privacy filter. We treat both
 *     `approved` (new lifecycle) and the legacy `confirmed` / `paid` as
 *     equivalent: the doctor has accepted (or, pre-Phase-3, payment alone
 *     implied acceptance), so the chat/inbox/profile should be visible.
 *
 *   * `DOCTOR_VISIBLE_STATUSES` — what shows up on the doctor's own pages.
 *     Deliberately EXCLUDES `pending_payment`: payment-before-doctor-sees
 *     means a patient who hasn't paid is invisible to the doctor. Spam
 *     incentive is removed because every "request" costs money up front.
 *
 *   * `DOCTOR_PENDING_DECISION_STATUSES` — what shows up on
 *     `/professional/booking-requests` (i.e. the doctor's inbox of things
 *     to act on). Right now that's only `pending_doctor_approval`.
 *
 *   * `DOCTOR_SCHEDULED_STATUSES` — what shows on `/professional/appointments`
 *     (the doctor's calendar/diary view). Decisions already made, future or
 *     past, both attended and not.
 *
 *   * `PATIENT_PENDING_QUOTA_STATUSES` — what counts toward the
 *     `MAX_PENDING_BOOKINGS_PER_PATIENT` cap. A booking that has been
 *     resolved (approved/rejected/cancelled/completed) no longer counts.
 *
 *   * `CANCELLABLE_BY_PATIENT_STATUSES` / `CANCELLABLE_BY_DOCTOR_STATUSES`
 *     — guard rails for the two cancel endpoints. Once a booking is
 *     `completed` / `missed` / `rejected` / `failed`, it's terminal.
 */

export const SLOT_HOLDING_STATUSES: ConsultationBookingStatus[] = [
  ConsultationBookingStatus.pending_payment,
  ConsultationBookingStatus.paid,
  ConsultationBookingStatus.pending_doctor_approval,
  ConsultationBookingStatus.approved,
  // Legacy: bookings created before Phase 3 went straight to `confirmed`
  // after payment. They still hold a slot until they're completed/cancelled.
  ConsultationBookingStatus.confirmed,
];

/**
 * Phase 4 chat gating: chat threads (and the doctor's `/patients` page in
 * general) are only opened up once the doctor has *explicitly approved* the
 * booking. `paid` is intentionally NOT in here: a patient who has paid but
 * whose booking is still awaiting the doctor's decision can submit notes
 * via the booking form, but cannot start an open-ended chat.
 *
 * Legacy `confirmed` is kept because pre-Phase-3 bookings landed straight
 * on that status post-payment and we don't want to retroactively close
 * those rooms.
 */
export const ACTIVE_DOCTOR_PATIENT_RELATIONSHIP_STATUSES: ConsultationBookingStatus[] =
  [
    ConsultationBookingStatus.approved,
    ConsultationBookingStatus.completed,
    // Legacy pre-Phase-3.
    ConsultationBookingStatus.confirmed,
  ];

/**
 * Phase 4 — explicit alias used by the messages module. We export this
 * separately from `ACTIVE_DOCTOR_PATIENT_RELATIONSHIP_STATUSES` so a future
 * tweak (e.g. "let approved-but-not-yet-paid patients chat with assistant
 * access") only has to touch one list.
 *
 * NOTE: status is the *necessary* condition for chat. It is no longer
 * *sufficient* — Phase 4 added a per-booking time window on top, see
 * `isBookingChatActive`. The doctor's `listThreads` / `getUnreadCount`
 * still use this status-only set so the doctor keeps seeing past patients
 * for medical-record continuity; outgoing messages are gated separately by
 * the time-window helper.
 */
export const CHAT_ALLOWED_STATUSES: ConsultationBookingStatus[] =
  ACTIVE_DOCTOR_PATIENT_RELATIONSHIP_STATUSES;

// ---------------------------------------------------------------------------
// Phase 4 — consultation window
//
// A consultation is "chat-active" only inside a tight window tied to the
// paid slot. Outside it, the chat goes read-only (history stays, send
// buttons go dark) until the patient pays for a follow-up.
//
//   * `SLOT_END_GRACE_MS` — minutes after `scheduledFor + durationMinutes`
//     the chat stays open for an `approved` booking. 30 min covers consults
//     running over without giving an unlimited free-followup window.
//
//   * `POST_COMPLETION_GRACE_MS` — once the doctor presses "Mark completed",
//     the chat stays open for 24h. Lets the patient ask one or two
//     clarifying questions ("did I read the dosage right?") without paying
//     again, but cuts off long-running threads.
//
//   * `LEGACY_CONFIRMED_FALLBACK_MS` — pre-Phase-3 bookings landed on
//     `confirmed` with no `scheduledFor`. We can't compute a real window
//     for them, so we treat the booking as chat-active for 24h from
//     creation. Realistic dev data won't trip this path.
// ---------------------------------------------------------------------------

export const SLOT_END_GRACE_MS = 30 * 60 * 1000;
export const POST_COMPLETION_GRACE_MS = 24 * 60 * 60 * 1000;
export const LEGACY_CONFIRMED_FALLBACK_MS = 24 * 60 * 60 * 1000;

/**
 * Returns the exact moment chat closes for the given booking, or `null`
 * when chat has never been open for this booking (e.g. status is
 * `pending_payment`, `rejected`, `cancelled`).
 *
 * Pure / testable — caller supplies `now` so unit tests don't have to
 * monkey-patch the global clock.
 */
export function bookingChatWindowEndsAt(
  booking: {
    status: ConsultationBookingStatus;
    scheduledFor: Date | null;
    durationMinutes: number;
    completedAt: Date | null;
    createdAt: Date;
  },
): Date | null {
  switch (booking.status) {
    case ConsultationBookingStatus.approved: {
      if (!booking.scheduledFor) {
        // Approved but unscheduled — fall back to a fixed grace from now.
        return new Date(booking.createdAt.getTime() + LEGACY_CONFIRMED_FALLBACK_MS);
      }
      const slotEndMs =
        booking.scheduledFor.getTime() + booking.durationMinutes * 60_000;
      return new Date(slotEndMs + SLOT_END_GRACE_MS);
    }
    case ConsultationBookingStatus.completed: {
      // After the doctor marks the consult done, hold the chat open for the
      // post-completion grace. If `completedAt` is missing (legacy data),
      // fall back to `updatedAt`-equivalent — we only have `createdAt`
      // exposed here, so use that as the worst-case anchor.
      const anchor = booking.completedAt ?? booking.createdAt;
      return new Date(anchor.getTime() + POST_COMPLETION_GRACE_MS);
    }
    case ConsultationBookingStatus.confirmed: {
      // Legacy pre-Phase-3. Best we can do is treat it like an approved
      // booking when we have a slot, otherwise fall back to a 24h window
      // from creation.
      if (booking.scheduledFor) {
        const slotEndMs =
          booking.scheduledFor.getTime() +
          booking.durationMinutes * 60_000;
        return new Date(slotEndMs + SLOT_END_GRACE_MS);
      }
      return new Date(booking.createdAt.getTime() + LEGACY_CONFIRMED_FALLBACK_MS);
    }
    default:
      // pending_payment, paid, pending_doctor_approval, rejected,
      // cancelled, missed, failed — chat never opens for these.
      return null;
  }
}

/**
 * `true` iff `now` falls inside the booking's chat window. Combines the
 * status check (`CHAT_ALLOWED_STATUSES`) with the time check.
 */
export function isBookingChatActive(
  booking: Parameters<typeof bookingChatWindowEndsAt>[0],
  now: Date = new Date(),
): boolean {
  if (!CHAT_ALLOWED_STATUSES.includes(booking.status)) return false;
  const endsAt = bookingChatWindowEndsAt(booking);
  if (!endsAt) return false;
  return now.getTime() < endsAt.getTime();
}

export const DOCTOR_VISIBLE_STATUSES: ConsultationBookingStatus[] = [
  ConsultationBookingStatus.pending_doctor_approval,
  ConsultationBookingStatus.approved,
  ConsultationBookingStatus.rejected,
  ConsultationBookingStatus.completed,
  ConsultationBookingStatus.missed,
  ConsultationBookingStatus.cancelled,
  // Legacy
  ConsultationBookingStatus.confirmed,
  ConsultationBookingStatus.paid,
];

export const DOCTOR_PENDING_DECISION_STATUSES: ConsultationBookingStatus[] = [
  ConsultationBookingStatus.pending_doctor_approval,
];

export const DOCTOR_SCHEDULED_STATUSES: ConsultationBookingStatus[] = [
  ConsultationBookingStatus.approved,
  ConsultationBookingStatus.completed,
  ConsultationBookingStatus.missed,
  // Legacy
  ConsultationBookingStatus.confirmed,
];

export const PATIENT_PENDING_QUOTA_STATUSES: ConsultationBookingStatus[] = [
  ConsultationBookingStatus.pending_payment,
  ConsultationBookingStatus.pending_doctor_approval,
  // `paid` is the (very short) window between webhook landing and the
  // auto-transition to `pending_doctor_approval`. Counted so a patient can't
  // rapid-pay several bookings before the transition catches up.
  ConsultationBookingStatus.paid,
];

export const CANCELLABLE_BY_PATIENT_STATUSES: ConsultationBookingStatus[] = [
  ConsultationBookingStatus.pending_payment,
  ConsultationBookingStatus.pending_doctor_approval,
  ConsultationBookingStatus.approved,
  // Legacy
  ConsultationBookingStatus.paid,
  ConsultationBookingStatus.confirmed,
];

export const CANCELLABLE_BY_DOCTOR_STATUSES: ConsultationBookingStatus[] = [
  ConsultationBookingStatus.approved,
  // Legacy
  ConsultationBookingStatus.confirmed,
];

/**
 * Statuses where the patient has paid (i.e. money exists that needs refunding
 * if the booking is cancelled before it's delivered).
 */
export const REFUNDABLE_STATUSES: ConsultationBookingStatus[] = [
  ConsultationBookingStatus.paid,
  ConsultationBookingStatus.pending_doctor_approval,
  ConsultationBookingStatus.approved,
  ConsultationBookingStatus.confirmed,
];

/**
 * Max simultaneous bookings a patient may have in the
 * `PATIENT_PENDING_QUOTA_STATUSES` set. Caps spam doctor-shopping while
 * still letting a patient queue up a couple of consult requests with
 * different doctors.
 */
export const MAX_PENDING_BOOKINGS_PER_PATIENT = 3;
