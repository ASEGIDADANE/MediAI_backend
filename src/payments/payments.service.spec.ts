import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  OnboardingUserRole,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChapaClient } from './chapa.client';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  let svc: PaymentsService;
  let prisma: {
    userProfile: { findUnique: jest.Mock };
    userAssistantAccess: { updateMany: jest.Mock; findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      userProfile: { findUnique: jest.fn() },
      userAssistantAccess: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn(),
      },
    };
    const mod = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ChapaClient, useValue: { verifyTransaction: jest.fn() } },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
            getOrThrow: jest.fn(() => 'CHASECK_TEST'),
          },
        },
      ],
    }).compile();
    svc = mod.get(PaymentsService);
  });

  it('requireActiveAssistantAccess resolves when user has no profile', async () => {
    prisma.userProfile.findUnique.mockResolvedValue(null);
    await expect(svc.requireActiveAssistantAccess('u1')).resolves.toBeUndefined();
    expect(prisma.userAssistantAccess.updateMany).not.toHaveBeenCalled();
  });

  it('requireActiveAssistantAccess resolves for professional accounts', async () => {
    prisma.userProfile.findUnique.mockResolvedValue({
      role: OnboardingUserRole.professional,
    });
    await expect(svc.requireActiveAssistantAccess('u1')).resolves.toBeUndefined();
    expect(prisma.userAssistantAccess.findFirst).not.toHaveBeenCalled();
  });

  it('requireActiveAssistantAccess throws for personal user without active pass', async () => {
    prisma.userProfile.findUnique.mockResolvedValue({
      role: OnboardingUserRole.personal,
    });
    prisma.userAssistantAccess.findFirst.mockResolvedValue(null);
    await expect(svc.requireActiveAssistantAccess('u1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('requireActiveAssistantAccess resolves when an active pass exists', async () => {
    prisma.userProfile.findUnique.mockResolvedValue({
      role: OnboardingUserRole.personal,
    });
    prisma.userAssistantAccess.findFirst.mockResolvedValue({ id: 'pass-1' });
    await expect(svc.requireActiveAssistantAccess('u1')).resolves.toBeUndefined();
  });
});
