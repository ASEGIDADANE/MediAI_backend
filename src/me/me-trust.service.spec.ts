import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MeTrustService } from './me-trust.service';
import { AccountAuditService } from './account-audit.service';
import { PrismaService } from '../prisma/prisma.service';

describe('MeTrustService — deleteAccount', () => {
  it('rejects Google-only user without confirm', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn(() =>
          Promise.resolve({
            id: 'u1',
            email: 'a@b.c',
            passwordHash: null,
          }),
        ),
      },
    };
    const mod = await Test.createTestingModule({
      providers: [
        MeTrustService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: () => 5_000_000 } },
        { provide: AccountAuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();
    const svc = mod.get(MeTrustService);
    await expect(
      svc.deleteAccount('u1', 'a@b.c', {}, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
