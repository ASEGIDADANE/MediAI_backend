import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const logger = new Logger('JwtConfig');

/** Only for local dev when JWT_SECRET is unset. Never use in production. */
const DEV_FALLBACK_SECRET =
  'dev-only-fixed-jwt-secret-do-not-use-in-production';

/**
 * Resolves JWT signing secret from env, with a dev fallback so `nest start`
 * works out of the box. Production must set JWT_SECRET.
 */
export function resolveJwtSecret(config: ConfigService): string {
  const secret = config.get<string>('JWT_SECRET')?.trim();
  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_SECRET is required in production. Set it in your environment.',
    );
  }

  logger.warn(
    'JWT_SECRET is not set — using an insecure development default. Add JWT_SECRET to .env.',
  );
  return DEV_FALLBACK_SECRET;
}
