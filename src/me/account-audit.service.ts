import { Injectable } from '@nestjs/common';
import { AccountAuditAction, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuditRequestContext } from './audit-request.util';

@Injectable()
export class AccountAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    userId: string,
    action: AccountAuditAction,
    ctx: AuditRequestContext | undefined,
    metadata: Prisma.InputJsonValue | undefined,
  ): Promise<void> {
    await this.prisma.accountAuditLog.create({
      data: {
        userId,
        action,
        ip: ctx?.ip ?? null,
        userAgent: ctx?.userAgent ?? null,
        metadata: metadata == null ? Prisma.JsonNull : metadata,
      },
    });
  }
}
