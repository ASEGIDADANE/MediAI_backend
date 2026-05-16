import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { Pool } from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private static readonly bootLogger = new Logger(PrismaService.name);
  private readonly pool: Pool;
  /** Dev-only: sanitized DB target (no password) logged after a successful connect. */
  private readonly devDbTarget?: string;

  constructor(config: ConfigService) {
    const connectionString = config.getOrThrow<string>('DATABASE_URL');
    if (process.env.NODE_ENV !== 'production') {
      try {
        const u = new URL(connectionString);
        const port = u.port || '5432';
        if (
          (u.hostname === 'localhost' || u.hostname === '127.0.0.1') &&
          port === '5432'
        ) {
          PrismaService.bootLogger.warn(
            'DATABASE_URL uses host port 5432. This repo\'s docker-compose publishes Postgres on host port 5433 — update .env or you will get Prisma P1000 for user `medi_ai`.',
          );
        }
      } catch {
        /* ignore malformed URL */
      }
    }
    const pool = new Pool({ connectionString });
    super({ adapter: new PrismaPg(pool) });
    this.pool = pool;
    if (process.env.NODE_ENV !== 'production') {
      try {
        const u = new URL(connectionString);
        const port = u.port || '5432';
        const db = (u.pathname || '/').replace(/^\//, '') || '(default)';
        this.devDbTarget = `user=${u.username} host=${u.hostname} port=${port} database=${db}`;
      } catch {
        /* ignore */
      }
    }
  }

  async onModuleInit() {
    await this.$connect();
    if (this.devDbTarget) {
      PrismaService.bootLogger.log(`PostgreSQL connected (${this.devDbTarget})`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}
