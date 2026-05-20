import { ConsultationType } from '../generated/prisma/client';

export function readNonNegativeJsonNumber(value: unknown, key: string): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  const next = (value as Record<string, unknown>)[key];
  if (typeof next === 'number' && Number.isFinite(next) && next >= 0) {
    return Math.trunc(next);
  }
  if (typeof next === 'string' && next.trim() !== '') {
    const parsed = Number(next);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.trunc(parsed);
    }
  }
  return 0;
}

/**
 * Maps a ConsultationType to the profile field name we look up. The MediAI
 * verification wizard currently stores fees under these top-level keys (and
 * optionally under a nested `consultationFees` object — see `readNested`).
 *
 * For Phase 4 we added `in_person` and `hybrid` as new consultation types.
 * Until the verification wizard surfaces separate fee inputs for them, we
 * fall back to:
 *   * `in_person` → the same fee the doctor charges for a video call
 *   * `hybrid`    → max(video, written) as a sensible "premium tier" default
 *
 * The fallback logic lives in `readConsultationFeeMajorFromProfile`; both
 * are still overridable by setting `inPersonConsultationFee` /
 * `hybridConsultationFee` (or the nested equivalents) on the profile.
 */
const FEE_KEY_BY_TYPE: Record<ConsultationType, string> = {
  [ConsultationType.video]: 'videoConsultationFee',
  [ConsultationType.written]: 'writtenConsultationFee',
  [ConsultationType.in_person]: 'inPersonConsultationFee',
  [ConsultationType.hybrid]: 'hybridConsultationFee',
};

const NESTED_FEE_KEY_BY_TYPE: Record<ConsultationType, string> = {
  [ConsultationType.video]: 'video',
  [ConsultationType.written]: 'written',
  [ConsultationType.in_person]: 'inPerson',
  [ConsultationType.hybrid]: 'hybrid',
};

/**
 * Reads consultation fee in **major currency units** (e.g. whole ETB) from
 * `UserProfile.professionalProfile` JSON. Supports top-level keys used by the
 * MediAI wizard and an optional nested
 * `{ consultationFees: { video, written, inPerson, hybrid } }`.
 *
 * For `in_person` / `hybrid` falls back to the video/written fees the doctor
 * already configured, so a doctor who only filled out the original two
 * fields can still accept in-person bookings out of the box.
 */
export function readConsultationFeeMajorFromProfile(
  profile: unknown,
  type: ConsultationType,
): number {
  const primary = readNonNegativeJsonNumber(profile, FEE_KEY_BY_TYPE[type]);
  if (primary > 0) return primary;
  if (profile && typeof profile === 'object' && !Array.isArray(profile)) {
    const nested = (profile as Record<string, unknown>).consultationFees;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const nestedVal = readNonNegativeJsonNumber(
        nested,
        NESTED_FEE_KEY_BY_TYPE[type],
      );
      if (nestedVal > 0) return nestedVal;
    }
  }

  if (type === ConsultationType.in_person) {
    return readConsultationFeeMajorFromProfile(profile, ConsultationType.video);
  }
  if (type === ConsultationType.hybrid) {
    const video = readConsultationFeeMajorFromProfile(
      profile,
      ConsultationType.video,
    );
    const written = readConsultationFeeMajorFromProfile(
      profile,
      ConsultationType.written,
    );
    return Math.max(video, written);
  }
  return 0;
}

export function readBothConsultationFeesMajor(profile: unknown): {
  video: number;
  written: number;
} {
  return {
    video: readConsultationFeeMajorFromProfile(profile, ConsultationType.video),
    written: readConsultationFeeMajorFromProfile(
      profile,
      ConsultationType.written,
    ),
  };
}
