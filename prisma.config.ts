import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://USER:PASSWORD@localhost:5432/medi_ai?schema=public';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed:
      'npx ts-node --compiler-options {"module":"CommonJS"} prisma/seed.ts',
  },
  datasource: {
    url: databaseUrl,
  },
});
