import { Test } from '@nestjs/testing';
import { UserAppRole } from '../generated/prisma/client';
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
});
