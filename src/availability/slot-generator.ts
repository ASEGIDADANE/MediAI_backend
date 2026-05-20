import { DateTime, IANAZone } from 'luxon';

/**
 * One generated bookable slot, expressed in UTC. Frontend renders the
 * timezone for the viewer; backend always speaks UTC ISO strings on the
 * wire to avoid round-trip ambiguity.
 */
export type GeneratedSlot = {
  startsAt: string;
  endsAt: string;
};

/** Per-day-of-week recurring availability rule. Mirrors Prisma model. */
export type AvailabilityRuleInput = {
  /** 0 = Sunday … 6 = Saturday (JS `Date.getDay()` convention). */
  dayOfWeek: number;
  /** Minutes since midnight, local to `timezone`. */
  startTimeMinutes: number;
  /** Exclusive; must be `> startTimeMinutes`. */
  endTimeMinutes: number;
  /** Length of each slot in minutes. Must divide the window evenly. */
  slotDurationMinutes: number;
  /** IANA tz name (e.g. `Africa/Addis_Ababa`). */
  timezone: string;
};

/** A `YYYY-MM-DD` day on which the doctor is fully unavailable. */
export type UnavailableDateInput = {
  /** ISO local date or full Date — only the year/month/day are used. */
  date: Date | string;
  /** IANA tz to interpret the bare date in (typically the rule's tz). */
  timezone: string;
};

/** A booking that already exists and blocks the same time window. */
export type ExistingBookingInput = {
  startsAt: Date | string;
  endsAt: Date | string;
};

export type ComputeSlotsArgs = {
  /** UTC start of the window — slots before this are dropped. */
  from: Date;
  /** Number of calendar days (in the rule's tz) to walk forward. */
  days: number;
  rules: AvailabilityRuleInput[];
  unavailableDates: UnavailableDateInput[];
  existingBookings: ExistingBookingInput[];
  /**
   * Hard upper bound on the number of slots offered *per calendar day*
   * (across all rules for that day). `null` = no cap. Applied after
   * blackout / booking subtraction so cancellations free up capacity.
   */
  maxAppointmentsPerDay: number | null;
  /**
   * Floor for the earliest slot we'll offer — typically `new Date()` so
   * patients can never book in the past. Pass `from` to allow any slot
   * inside the window.
   */
  notBefore?: Date;
};

/**
 * Pure slot-generation algorithm. Walks every day in `[from, from + days)`
 * (in each rule's own timezone), expands matching weekly rules into a list
 * of slots, then subtracts:
 *
 *   1. The whole day if it appears in `unavailableDates`.
 *   2. Any slot that overlaps with an `existingBookings` window.
 *   3. Any slot whose `startsAt` is before `notBefore` (default: now).
 *
 * Finally applies `maxAppointmentsPerDay` as a soft cap (taking the
 * earliest N remaining slots for each day) and returns a sorted,
 * de-duplicated `GeneratedSlot[]`.
 *
 * The function is timezone-aware: a "Monday 9am–5pm" rule in
 * `Africa/Addis_Ababa` will correctly generate slots starting at 06:00 UTC,
 * and the algorithm will not double-up at DST transitions because Luxon
 * does the local→UTC math.
 */
export function computeAvailableSlots(args: ComputeSlotsArgs): GeneratedSlot[] {
  const {
    from,
    days,
    rules,
    unavailableDates,
    existingBookings,
    maxAppointmentsPerDay,
    notBefore = new Date(),
  } = args;

  if (days <= 0 || rules.length === 0) return [];

  const blockedDayByTz = new Map<string, Set<string>>(); // tz → ISO date set
  for (const u of unavailableDates) {
    const iso = isoLocalDate(u.date, u.timezone);
    if (!iso) continue;
    const set = blockedDayByTz.get(u.timezone) ?? new Set<string>();
    set.add(iso);
    blockedDayByTz.set(u.timezone, set);
  }

  // Existing bookings are converted to UTC epoch ranges once so the inner
  // overlap loop is O(slots * bookings) with cheap integer comparisons.
  const bookingRanges = existingBookings
    .map((b) => ({
      start: new Date(b.startsAt).getTime(),
      end: new Date(b.endsAt).getTime(),
    }))
    .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end));

  const notBeforeMs = notBefore.getTime();
  // Bucket slots by `YYYY-MM-DD` (in the rule's tz) so the per-day cap can
  // be applied cohesively across multiple rules for the same day.
  const slotsByDayKey = new Map<string, GeneratedSlot[]>();

  for (const rule of rules) {
    if (!isValidRule(rule)) continue;
    const zone = IANAZone.create(rule.timezone);
    if (!zone.isValid) continue;

    const blocked = blockedDayByTz.get(rule.timezone) ?? new Set<string>();

    // Walk the window day-by-day in the rule's local timezone. We anchor
    // the cursor at the start-of-day in `zone` so DST shifts don't drift
    // the iteration by an hour.
    let cursor = DateTime.fromJSDate(from, { zone }).startOf('day');
    for (let i = 0; i < days; i += 1) {
      const dayKey = cursor.toISODate();
      if (
        dayKey !== null &&
        !blocked.has(dayKey) &&
        cursor.weekday % 7 === rule.dayOfWeek
      ) {
        // Luxon `weekday`: 1=Mon..7=Sun. JS `Date.getDay()`: 0=Sun..6=Sat.
        // `weekday % 7` maps Sun(7→0), Mon(1→1), …, Sat(6→6) — same as JS.
        const dayStart = cursor.plus({ minutes: rule.startTimeMinutes });
        const dayEnd = cursor.plus({ minutes: rule.endTimeMinutes });
        const slotMs = rule.slotDurationMinutes * 60 * 1000;

        let slotStart = dayStart;
        while (
          slotStart.plus({ minutes: rule.slotDurationMinutes }) <= dayEnd
        ) {
          const slotEnd = slotStart.plus({
            minutes: rule.slotDurationMinutes,
          });
          const startMs = slotStart.toMillis();
          const endMs = slotEnd.toMillis();

          const tooSoon = startMs < notBeforeMs;
          const overlaps = bookingRanges.some(
            (b) => startMs < b.end && endMs > b.start,
          );

          if (!tooSoon && !overlaps) {
            const list = slotsByDayKey.get(dayKey) ?? [];
            list.push({
              startsAt: slotStart.toUTC().toISO()!,
              endsAt: slotEnd.toUTC().toISO()!,
            });
            slotsByDayKey.set(dayKey, list);
          }

          slotStart = DateTime.fromMillis(startMs + slotMs, { zone });
        }
      }
      cursor = cursor.plus({ days: 1 });
    }
  }

  const out: GeneratedSlot[] = [];
  for (const list of slotsByDayKey.values()) {
    list.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const capped =
      maxAppointmentsPerDay && maxAppointmentsPerDay > 0
        ? list.slice(0, maxAppointmentsPerDay)
        : list;
    for (const s of capped) out.push(s);
  }

  // Final dedupe by start time (defensive — overlapping rules could in theory
  // emit the same slot twice).
  const seen = new Set<string>();
  const deduped = out.filter((s) => {
    if (seen.has(s.startsAt)) return false;
    seen.add(s.startsAt);
    return true;
  });

  deduped.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return deduped;
}

function isValidRule(rule: AvailabilityRuleInput): boolean {
  if (rule.dayOfWeek < 0 || rule.dayOfWeek > 6) return false;
  if (rule.startTimeMinutes < 0 || rule.endTimeMinutes > 24 * 60) return false;
  if (rule.endTimeMinutes <= rule.startTimeMinutes) return false;
  if (rule.slotDurationMinutes <= 0) return false;
  if (rule.slotDurationMinutes > rule.endTimeMinutes - rule.startTimeMinutes) {
    return false;
  }
  if (!rule.timezone) return false;
  return true;
}

function isoLocalDate(date: Date | string, timezone: string): string | null {
  const dt =
    typeof date === 'string'
      ? DateTime.fromISO(date, { zone: timezone })
      : DateTime.fromJSDate(date, { zone: timezone });
  return dt.isValid ? dt.toISODate() : null;
}
