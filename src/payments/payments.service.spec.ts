import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  OnboardingUserRole,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ChapaClient } from './chapa.client';
import { PersonalChatAccessService } from './personal-chat-access.service';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  let svc: PaymentsService;
  let personalChatAccess: {
    getAccessState: jest.Mock;
    assertCanSendPersonalMessage: jest.Mock;
  };
  let prisma: {
    userProfile: { findUnique: jest.Mock };
    userAssistantAccess: { updateMany: jest.Mock; findFirst: jest.Mock };
    $transaction: jest.Mock;
    consultationBooking: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    personalChatAccess = {
      getAccessState: jest.fn().mockResolvedValue({
        paidActive: false,
        trial: {
          enabled: true,
          limit: 3,
          used: 0,
          remaining: 3,
          exhausted: false,
        },
        personalChatAllowed: true,
        personalChatReadOnly: false,
      }),
      assertCanSendPersonalMessage: jest.fn().mockResolvedValue(undefined),
    };
    prisma = {
      userProfile: { findUnique: jest.fn() },
      userAssistantAccess: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn(),
      },
      $transaction: jest.fn(),
      consultationBooking: { findMany: jest.fn().mockResolvedValue([]) },
    };
    prisma.$transaction.mockImplementation(async (ops: unknown[]) => {
      const results = [];
      for (const op of ops) {
        results.push(await op);
      }
      return results;
    });
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
        { provide: PersonalChatAccessService, useValue: personalChatAccess },
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

  // ---------------------------------------------------------------------------
  // Phase 7 — requireActiveSubscription (canonical gate, accepts either a
  // SubscriptionPlan-backed UserSubscription *or* a legacy UserAssistantAccess
  // as a transitional fallback)
  // ---------------------------------------------------------------------------

  it('requireActiveSubscription resolves for professionals (gate bypassed)', async () => {
    prisma.userProfile.findUnique.mockResolvedValue({
      role: OnboardingUserRole.professional,
    });
    await expect(svc.requireActiveSubscription('u1')).resolves.toBeUndefined();
    expect(prisma.userSubscription.findFirst).not.toHaveBeenCalled();
    expect(prisma.userAssistantAccess.findFirst).not.toHaveBeenCalled();
  });

  it('requireActiveSubscription throws when patient has no active row in either table', async () => {
    prisma.userProfile.findUnique.mockResolvedValue({
      role: OnboardingUserRole.personal,
    });
    prisma.userSubscription.findFirst.mockResolvedValue(null);
    prisma.userAssistantAccess.findFirst.mockResolvedValue(null);
    await expect(svc.requireActiveSubscription('u1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('requireActiveSubscription resolves when a paid UserSubscription is active', async () => {
    prisma.userProfile.findUnique.mockResolvedValue({
      role: OnboardingUserRole.personal,
    });
    prisma.userSubscription.findFirst.mockResolvedValue({ id: 'sub-1' });
    prisma.userAssistantAccess.findFirst.mockResolvedValue(null);
    await expect(svc.requireActiveSubscription('u1')).resolves.toBeUndefined();
  });

  it('requireActiveSubscription resolves on legacy assistant pass fallback', async () => {
    prisma.userProfile.findUnique.mockResolvedValue({
      role: OnboardingUserRole.personal,
    });
    prisma.userSubscription.findFirst.mockResolvedValue(null);
    prisma.userAssistantAccess.findFirst.mockResolvedValue({ id: 'pass-1' });
    await expect(svc.requireActiveSubscription('u1')).resolves.toBeUndefined();
  });
});
