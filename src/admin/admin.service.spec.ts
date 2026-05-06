import { Test } from '@nestjs/testing';
import {
  AccountAuditAction,
  OnboardingUserRole,
  UserAppRole,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  it('getSummary returns counts from transaction', async () => {
    const userCount = jest
      .fn()
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(3);
    const prisma = {
      $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
      user: { count: userCount },
      userProfile: { count: jest.fn().mockResolvedValue(8) },
      supportReport: { count: jest.fn().mockResolvedValue(4) },
    };
    const mod = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    const svc = mod.get(AdminService);
    const s = await svc.getSummary();
    expect(s).toEqual({
      userCount: 10,
      profileCount: 8,
      supportReportCount: 4,
      adminCount: 1,
      last24hRegistrations: 3,
    });
    expect(userCount).toHaveBeenCalledTimes(3);
    expect(userCount).toHaveBeenNthCalledWith(2, {
      where: { appRole: UserAppRole.admin },
    });
    expect(userCount).toHaveBeenNthCalledWith(3, {
      where: { createdAt: { gte: expect.any(Date) } },
    });
  });

  it('listUsers exposes preferredName and specialty derived from professionalProfile', async () => {
    const created = new Date('2025-01-02T03:04:05.000Z');
    const updated = new Date('2025-01-02T03:05:05.000Z');
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'u-pro',
        email: 'doc@example.com',
        appRole: UserAppRole.user,
        createdAt: created,
        updatedAt: updated,
        profile: {
          role: OnboardingUserRole.professional,
          preferredName: 'Dr. Pat',
          professionalProfile: { specialty: 'Cardiology', extra: 'ignored' },
        },
      },
      {
        id: 'u-personal',
        email: 'pat@example.com',
        appRole: UserAppRole.user,
        createdAt: created,
        updatedAt: updated,
        profile: {
          role: OnboardingUserRole.personal,
          preferredName: 'Pat',
          professionalProfile: null,
        },
      },
      {
        id: 'u-no-profile',
        email: 'nobody@example.com',
        appRole: UserAppRole.user,
        createdAt: created,
        updatedAt: updated,
        profile: null,
      },
    ]);
    const count = jest.fn().mockResolvedValue(3);
    const prisma = {
      $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
      user: { findMany, count },
    };
    const mod = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    const svc = mod.get(AdminService);
    const res = await svc.listUsers({});
    expect(res.items[0]).toMatchObject({
      id: 'u-pro',
      preferredName: 'Dr. Pat',
      profileRole: 'professional',
      specialty: 'Cardiology',
    });
    expect(res.items[1]).toMatchObject({
      preferredName: 'Pat',
      profileRole: 'personal',
      specialty: null,
    });
    expect(res.items[2]).toMatchObject({
      hasProfile: false,
      preferredName: null,
      specialty: null,
      profileRole: null,
    });
  });

  it('getRecentActivity merges signups, audits, and support reports newest first', async () => {
    const t = (iso: string) => new Date(iso);
    const userFindMany = jest.fn().mockResolvedValue([
      { id: 'u1', email: 'alice@example.com', createdAt: t('2025-01-03T00:00:00.000Z') },
      { id: 'u2', email: 'bob@example.com', createdAt: t('2025-01-01T00:00:00.000Z') },
    ]);
    const auditFindMany = jest.fn().mockResolvedValue([
      {
        id: 'a1',
        action: AccountAuditAction.profile_patch,
        createdAt: t('2025-01-04T00:00:00.000Z'),
        user: { email: 'alice@example.com' },
      },
      {
        id: 'a2',
        action: AccountAuditAction.account_delete_initiated,
        createdAt: t('2025-01-02T00:00:00.000Z'),
        user: null,
      },
    ]);
    const supportFindMany = jest.fn().mockResolvedValue([
      {
        id: 's1',
        createdAt: t('2025-01-05T00:00:00.000Z'),
        user: { email: 'bob@example.com' },
      },
    ]);
    const prisma = {
      $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
      user: { findMany: userFindMany },
      accountAuditLog: { findMany: auditFindMany },
      supportReport: { findMany: supportFindMany },
    };
    const mod = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    const svc = mod.get(AdminService);
    const { items } = await svc.getRecentActivity({ limit: 10 });

    // Newest first across all three sources.
    expect(items.map((i) => i.id)).toEqual([
      'support_s1',
      'audit_a1',
      'signup_u1',
      'audit_a2',
      'signup_u2',
    ]);
    expect(items[0]).toMatchObject({
      type: 'support_report',
      description: 'bob@example.com submitted a support report',
    });
    expect(items[1]).toMatchObject({
      type: 'profile_update',
      description: 'alice@example.com updated their profile',
    });
    // Audit row whose user has been deleted falls back to "A user".
    expect(items[3]).toMatchObject({
      type: 'account_delete',
      description: 'A user started account deletion',
    });
  });
});
