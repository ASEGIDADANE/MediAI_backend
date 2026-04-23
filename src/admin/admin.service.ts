import { Injectable } from '@nestjs/common';
import {
  OnboardingUserRole,
  UserAppRole,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { takeSkipFromPagination } from './dto/admin-pagination-query.dto';
import type { AdminSupportReportsQueryDto } from './dto/admin-support-reports-query.dto';
import type { AdminUsersQueryDto } from './dto/admin-users-query.dto';

const MESSAGE_PREVIEW_MAX = 500;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(dto: AdminUsersQueryDto) {
    const { take, skip, page, pageSize } = takeSkipFromPagination(
      dto.page,
      dto.pageSize,
    );
    const q = dto.q?.trim();
    const where =
      q && q.length > 0
        ? { email: { contains: q, mode: 'insensitive' as const } }
        : {};

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        select: {
          id: true,
          email: true,
          appRole: true,
          createdAt: true,
          updatedAt: true,
          profile: { select: { role: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    const items = rows.map((r) => ({
      id: r.id,
      email: r.email,
      appRole: r.appRole,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      hasProfile: r.profile !== null,
      profileRole: r.profile
        ? (r.profile.role === OnboardingUserRole.personal
            ? ('personal' as const)
            : ('professional' as const))
        : null,
    }));

    return { items, page, pageSize, total };
  }

  async listSupportReports(dto: AdminSupportReportsQueryDto) {
    const { take, skip, page, pageSize } = takeSkipFromPagination(
      dto.page,
      dto.pageSize,
    );
    const where = dto.userId
      ? { userId: dto.userId as string }
      : {};

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.supportReport.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        select: { id: true, userId: true, message: true, createdAt: true },
      }),
      this.prisma.supportReport.count({ where }),
    ]);

    const items = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      messagePreview:
        r.message.length > MESSAGE_PREVIEW_MAX
          ? `${r.message.slice(0, MESSAGE_PREVIEW_MAX - 1)}…`
          : r.message,
      createdAt: r.createdAt.toISOString(),
    }));

    return { items, page, pageSize, total };
  }

  async getSummary() {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      userCount,
      profileCount,
      supportReportCount,
      adminCount,
      last24hRegistrations,
    ] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.userProfile.count(),
      this.prisma.supportReport.count(),
      this.prisma.user.count({ where: { appRole: UserAppRole.admin } }),
      this.prisma.user.count({
        where: { createdAt: { gte: dayAgo } },
      }),
    ]);

    return {
      userCount,
      profileCount,
      supportReportCount,
      adminCount,
      last24hRegistrations,
    };
  }
}
