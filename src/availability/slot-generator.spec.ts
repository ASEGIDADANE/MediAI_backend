import { computeAvailableSlots } from './slot-generator';

// Reusable Mon 09:00–17:00, 30-min slots, in UTC (so we don't fight DST in
// fixtures). Real callers usually pass `Africa/Addis_Ababa` etc.
const MON_9_TO_5_UTC = {
  dayOfWeek: 1,
  startTimeMinutes: 9 * 60,
  endTimeMinutes: 17 * 60,
  slotDurationMinutes: 30,
  timezone: 'UTC',
};

describe('computeAvailableSlots', () => {
  it('generates back-to-back slots inside a single rule window', () => {
    // Window starts on Sunday so the rule fires on day 1 (Monday).
    const out = computeAvailableSlots({
      from: new Date('2026-06-07T00:00:00.000Z'),
      days: 7,
      rules: [MON_9_TO_5_UTC],
      unavailableDates: [],
      existingBookings: [],
      maxAppointmentsPerDay: null,
      // Anchor `notBefore` to the start of the window so the "no past slots"
      // rule doesn't filter our fixture.
      notBefore: new Date('2026-06-07T00:00:00.000Z'),
    });

    // 8 hours / 30 min = 16 slots for the one Monday in the window.
    expect(out).toHaveLength(16);
    expect(out[0]).toEqual({
      startsAt: '2026-06-08T09:00:00.000Z',
      endsAt: '2026-06-08T09:30:00.000Z',
    });
    expect(out[out.length - 1]).toEqual({
      startsAt: '2026-06-08T16:30:00.000Z',
      endsAt: '2026-06-08T17:00:00.000Z',
    });
  });

  it('returns nothing when no rule matches the day-of-week in the window', () => {
    // Window is a single Sunday → Monday rule never fires.
    const out = computeAvailableSlots({
      from: new Date('2026-06-07T00:00:00.000Z'),
      days: 1,
      rules: [MON_9_TO_5_UTC],
      unavailableDates: [],
      existingBookings: [],
      maxAppointmentsPerDay: null,
      notBefore: new Date('2026-06-07T00:00:00.000Z'),
    });
    expect(out).toEqual([]);
  });

  it('skips slots in the past (notBefore filter)', () => {
    // notBefore is mid-window; the first 4 slots of the day should be hidden.
    const out = computeAvailableSlots({
      from: new Date('2026-06-08T00:00:00.000Z'),
      days: 1,
      rules: [MON_9_TO_5_UTC],
      unavailableDates: [],
      existingBookings: [],
      maxAppointmentsPerDay: null,
      notBefore: new Date('2026-06-08T11:00:00.000Z'),
    });
    expect(out[0].startsAt).toBe('2026-06-08T11:00:00.000Z');
    expect(out).toHaveLength(12); // 17:00 - 11:00 = 6h / 30m = 12 slots
  });

  it('drops the whole day when it appears in unavailableDates', () => {
    const out = computeAvailableSlots({
      from: new Date('2026-06-07T00:00:00.000Z'),
      days: 7,
      rules: [MON_9_TO_5_UTC],
      unavailableDates: [
        { date: '2026-06-08', timezone: 'UTC' }, // the only Monday
      ],
      existingBookings: [],
      maxAppointmentsPerDay: null,
      notBefore: new Date('2026-06-07T00:00:00.000Z'),
    });
    expect(out).toEqual([]);
  });

  it('subtracts overlapping bookings (and only those that actually overlap)', () => {
    // Block 09:00–10:00 with a real booking; that should kill the 09:00 and
    // 09:30 slots but NOT touch 10:00 onward.
    const out = computeAvailableSlots({
      from: new Date('2026-06-07T00:00:00.000Z'),
      days: 7,
      rules: [MON_9_TO_5_UTC],
      unavailableDates: [],
      existingBookings: [
        {
          startsAt: '2026-06-08T09:00:00.000Z',
          endsAt: '2026-06-08T10:00:00.000Z',
        },
      ],
      maxAppointmentsPerDay: null,
      notBefore: new Date('2026-06-07T00:00:00.000Z'),
    });
    expect(
      out.find((s) => s.startsAt === '2026-06-08T09:00:00.000Z'),
    ).toBeUndefined();
    expect(
      out.find((s) => s.startsAt === '2026-06-08T09:30:00.000Z'),
    ).toBeUndefined();
    expect(out[0].startsAt).toBe('2026-06-08T10:00:00.000Z');
  });

  it('applies maxAppointmentsPerDay as a soft per-day cap (earliest slots win)', () => {
    const out = computeAvailableSlots({
      from: new Date('2026-06-07T00:00:00.000Z'),
      days: 7,
      rules: [MON_9_TO_5_UTC],
      unavailableDates: [],
      existingBookings: [],
      maxAppointmentsPerDay: 4,
      notBefore: new Date('2026-06-07T00:00:00.000Z'),
    });
    expect(out).toHaveLength(4);
    expect(out.map((s) => s.startsAt)).toEqual([
      '2026-06-08T09:00:00.000Z',
      '2026-06-08T09:30:00.000Z',
      '2026-06-08T10:00:00.000Z',
      '2026-06-08T10:30:00.000Z',
    ]);
  });

  it('respects a non-UTC timezone (Mon 09:00 Addis = 06:00 UTC)', () => {
    // Africa/Addis_Ababa has a fixed +03:00 offset (no DST).
    const out = computeAvailableSlots({
      from: new Date('2026-06-07T00:00:00.000Z'),
      days: 7,
      rules: [{ ...MON_9_TO_5_UTC, timezone: 'Africa/Addis_Ababa' }],
      unavailableDates: [],
      existingBookings: [],
      maxAppointmentsPerDay: null,
      notBefore: new Date('2026-06-07T00:00:00.000Z'),
    });
    expect(out[0].startsAt).toBe('2026-06-08T06:00:00.000Z');
    expect(out[out.length - 1].endsAt).toBe('2026-06-08T14:00:00.000Z');
  });

  it('emits two separate windows when two rules carve out a lunch break', () => {
    // Mon 09:00–13:00 then 14:00–17:00 = lunch from 13:00 to 14:00.
    const morning = { ...MON_9_TO_5_UTC, endTimeMinutes: 13 * 60 };
    const afternoon = { ...MON_9_TO_5_UTC, startTimeMinutes: 14 * 60 };
    const out = computeAvailableSlots({
      from: new Date('2026-06-07T00:00:00.000Z'),
      days: 7,
      rules: [morning, afternoon],
      unavailableDates: [],
      existingBookings: [],
      maxAppointmentsPerDay: null,
      notBefore: new Date('2026-06-07T00:00:00.000Z'),
    });
    expect(
      out.find((s) => s.startsAt === '2026-06-08T13:00:00.000Z'),
    ).toBeUndefined();
    expect(
      out.find((s) => s.startsAt === '2026-06-08T13:30:00.000Z'),
    ).toBeUndefined();
    expect(
      out.find((s) => s.startsAt === '2026-06-08T14:00:00.000Z'),
    ).toBeDefined();
  });

  it('drops a rule whose timezone is invalid (IANA-only) without throwing', () => {
    const out = computeAvailableSlots({
      from: new Date('2026-06-07T00:00:00.000Z'),
      days: 7,
      rules: [{ ...MON_9_TO_5_UTC, timezone: 'Mars/Olympus_Mons' }],
      unavailableDates: [],
      existingBookings: [],
      maxAppointmentsPerDay: null,
      notBefore: new Date('2026-06-07T00:00:00.000Z'),
    });
    expect(out).toEqual([]);
  });

  it('rejects nonsensical rule shapes (end<=start, slot bigger than window, …)', () => {
    const out = computeAvailableSlots({
      from: new Date('2026-06-07T00:00:00.000Z'),
      days: 7,
      rules: [
        { ...MON_9_TO_5_UTC, endTimeMinutes: 5 * 60 }, // end before start
        { ...MON_9_TO_5_UTC, slotDurationMinutes: 24 * 60 }, // slot too long
        { ...MON_9_TO_5_UTC, dayOfWeek: 9 }, // out-of-range day
      ],
      unavailableDates: [],
      existingBookings: [],
      maxAppointmentsPerDay: null,
      notBefore: new Date('2026-06-07T00:00:00.000Z'),
    });
    expect(out).toEqual([]);
  });

  it('dedupes when two overlapping rules emit the same slot', () => {
    // Two identical rules — every generated slot would appear twice without
    // dedupe.
    const out = computeAvailableSlots({
      from: new Date('2026-06-07T00:00:00.000Z'),
      days: 7,
      rules: [MON_9_TO_5_UTC, MON_9_TO_5_UTC],
      unavailableDates: [],
      existingBookings: [],
      maxAppointmentsPerDay: null,
      notBefore: new Date('2026-06-07T00:00:00.000Z'),
    });
    expect(out).toHaveLength(16);
    const set = new Set(out.map((s) => s.startsAt));
    expect(set.size).toBe(16);
  });
});
