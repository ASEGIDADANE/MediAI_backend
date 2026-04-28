import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AccountAuditAction } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountAuditService } from './account-audit.service';
import type { AuditRequestContext } from './audit-request.util';
import type { DeleteAccountDto } from './dto/delete-account.dto';
import {
  parseMedicalHistory,
  userProfileToDashboardProfile,
} from './user-profile.mapper';

export type DataExportJson = {
  exportVersion: 1;
  exportedAt: string;
  user: { id: string; email: string; createdAt: string };
  /** Same shape as `GET /api/me/profile` body. */
  me: {
    profile: ReturnType<typeof userProfileToDashboardProfile> | null;
    medicalHistory: ReturnType<typeof parseMedicalHistory>;
    aiDoctorSetupCompleted: boolean;
  };
  chat: {
    /**
     * All `ChatConversation` rows for this user (personal and general-with-login), with messages.
     */
    conversations: {
      id: string;
      kind: string;
      clientSessionId: string | null;
      createdAt: string;
      updatedAt: string;
      messages: {
        id: string;
        role: string;
        content: string;
        metadata: unknown;
        createdAt: string;
      }[];
    }[];
  };
  supportReports: { id: string; message: string; createdAt: string }[];
  supportReportPolicy: 'deleted_with_account';
};

@Injectable()
export class MeTrustService {
  private readonly log = new Logger(MeTrustService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AccountAuditService,
  ) {}

  maxExportBytes(): number {
    return Number(
      this.config.get('ME_EXPORT_MAX_BYTES', '5000000') || 5_000_000,
    );
  }

  async buildExport(
    userId: string,
  ): Promise<{ body: DataExportJson; filename: string; byteLength: number }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, createdAt: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [profileRow, convos, reports] = await Promise.all([
      this.prisma.userProfile.findUnique({ where: { userId } }),
      this.prisma.chatConversation.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
        },
      }),
      this.prisma.supportReport.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
        select: { id: true, message: true, createdAt: true },
      }),
    ]);

    const me = profileRow
      ? {
          profile: userProfileToDashboardProfile(profileRow),
          medicalHistory: parseMedicalHistory(profileRow.medicalHistory),
          aiDoctorSetupCompleted: profileRow.aiDoctorSetupCompleted,
        }
      : {
          profile: null,
          medicalHistory: null,
          aiDoctorSetupCompleted: false,
        };

    const body: DataExportJson = {
      exportVersion: 1,
      exportedAt: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt.toISOString(),
      },
      me,
      chat: {
        conversations: convos.map((c) => ({
          id: c.id,
          kind: c.kind,
          clientSessionId: c.clientSessionId,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
          messages: c.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            metadata: m.metadata,
            createdAt: m.createdAt.toISOString(),
          })),
        })),
      },
      supportReports: reports.map((r) => ({
        id: r.id,
        message: r.message,
        createdAt: r.createdAt.toISOString(),
      })),
      supportReportPolicy: 'deleted_with_account',
    };

    const json = JSON.stringify(body);
    const byteLength = Buffer.byteLength(json, 'utf8');
    if (byteLength > this.maxExportBytes()) {
      throw new HttpException(
        {
          error: 'export_too_large',
          message:
            'Export exceeds maximum size. Contact support or reduce data.',
        },
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    const filename = `mediai-export-${userId.slice(0, 8)}-${
      body.exportedAt.split('T')[0]
    }.json`;
    return { body, filename, byteLength };
  }

  async logExportAudit(
    userId: string,
    byteLength: number,
    ctx: AuditRequestContext | undefined,
  ): Promise<void> {
    await this.audit.log(
      userId,
      AccountAuditAction.data_export,
      ctx,
      { byteLength },
    );
  }

  async deleteAccount(
    userId: string,
    email: string,
    dto: DeleteAccountDto,
    ctx: AuditRequestContext | undefined,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true, email: true },
    });
    if (!user) {
      throw new NotFoundException();
    }
    if (user.email !== email) {
      throw new UnauthorizedException();
    }

    if (user.passwordHash) {
      if (!dto.password) {
        throw new BadRequestException('password is required to delete this account');
      }
      const ok = await bcrypt.compare(dto.password, user.passwordHash);
      if (!ok) {
        throw new UnauthorizedException('Invalid password');
      }
    } else {
      if (dto.confirm !== 'DELETE') {
        throw new BadRequestException(
          'For OAuth-only accounts, send { "confirm": "DELETE" }',
        );
      }
    }

    this.log.log(
      JSON.stringify({
        event: 'account_deleted',
        userId,
        method: user.passwordHash ? 'password' : 'oauth',
      }),
    );

    await this.audit.log(userId, AccountAuditAction.account_delete_initiated, ctx, {
      confirmMethod: user.passwordHash ? 'password' : 'oauth',
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.supportReport.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
    });
  }
}
