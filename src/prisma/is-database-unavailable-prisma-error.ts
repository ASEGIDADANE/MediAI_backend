import { Prisma } from '../generated/prisma/client';

const KNOWN_DOWN_CODES = new Set(['P1000', 'P1001', 'P1017']);

function metaLooksLikePgAuthFailure(meta: unknown): boolean {
  if (meta == null || typeof meta !== 'object') return false;
  const m = meta as Record<string, unknown>;
  const adapter = m.driverAdapterError;
  if (adapter && typeof adapter === 'object' && 'cause' in adapter) {
    const cause = (adapter as { cause?: Record<string, unknown> }).cause;
    if (cause && typeof cause === 'object') {
      if (cause.originalCode === '28P01') return true;
      if (cause.kind === 'AuthenticationFailed') return true;
      const om = cause.originalMessage;
      if (
        typeof om === 'string' &&
        /password authentication failed/i.test(om)
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Maps Prisma errors that should surface as “database unavailable” (503) in the API.
 * P2010 + 28P01 happens with pg adapter when `DATABASE_URL` password does not match
 * the cluster (e.g. stale Docker volume from an older `POSTGRES_PASSWORD`).
 */
export function isDatabaseUnavailablePrismaError(
  e: Prisma.PrismaClientKnownRequestError,
): boolean {
  if (KNOWN_DOWN_CODES.has(e.code)) return true;
  if (e.code === 'P2010') {
    if (/28P01|password authentication failed|AuthenticationFailed/i.test(e.message)) {
      return true;
    }
    return metaLooksLikePgAuthFailure(e.meta);
  }
  return false;
}
