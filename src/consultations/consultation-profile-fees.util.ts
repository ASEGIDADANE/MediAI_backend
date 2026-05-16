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
 * Reads consultation fee in **major currency units** (e.g. whole ETB) from
 * `UserProfile.professionalProfile` JSON. Supports top-level keys used by the
 * MediAI wizard and an optional nested `{ consultationFees: { video, written } }`.
 */
export function readConsultationFeeMajorFromProfile(
  profile: unknown,
  type: ConsultationType,
): number {
  const key =
    type === ConsultationType.video
      ? 'videoConsultationFee'
      : 'writtenConsultationFee';
  const primary = readNonNegativeJsonNumber(profile, key);
  if (primary > 0) return primary;
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return 0;
  }
  const nested = (profile as Record<string, unknown>).consultationFees;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const n = nested as Record<string, unknown>;
    if (type === ConsultationType.video) {
      return readNonNegativeJsonNumber(n, 'video');
    }
    return readNonNegativeJsonNumber(n, 'written');
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
