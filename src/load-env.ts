import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

/**
 * Load `MediAI_backend/.env` before Nest boot. Path is anchored to this file’s
 * location (`dist/` at runtime → parent folder is the backend root), not
 * `process.cwd()`, so starting Nest from another directory still picks up the
 * correct `DATABASE_URL` (avoids P1000 when cwd is wrong).
 */
const envPath = resolve(__dirname, '..', '.env');
if (existsSync(envPath)) {
  config({ path: envPath, override: true });
}
