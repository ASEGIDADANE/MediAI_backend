import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://USER:PASSWORD@localhost:5432/medi_ai?schema=public';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // Prisma 7 reads the seed command from here (the legacy "prisma.seed"
    // entry in package.json is ignored once prisma.config.ts exists).
    // `--transpile-only` skips a few pre-existing `Prisma.JsonValue` cast
    // typecheck errors that don't reflect any runtime issue.
    seed: 'npx ts-node --transpile-only --compiler-options {"module":"CommonJS"} prisma/seed.ts',
  },
  datasource: {
    url: databaseUrl,
  },
});
