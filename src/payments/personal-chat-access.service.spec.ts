import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  AssistantAccessStatus,
  OnboardingUserRole,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PersonalChatAccessService } from './personal-chat-access.service';

describe('PersonalChatAccessService', () => {
  let svc: PersonalChatAccessService;
  let prisma: {
    userProfile: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
    };
    userAssistantAccess: { updateMany: jest.Mock; findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      userProfile: {
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
      userAssistantAccess: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    const mod = await Test.createTestingModule({
      providers: [
        PersonalChatAccessService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, def?: string) => {
              if (key === 'ASSISTANT_TRIAL_ENABLED') return 'true';
              if (key === 'ASSISTANT_TRIAL_LIMIT') return '3';
              return def;
            },
          },
        },
      ],
    }).compile();

    svc = mod.get(PersonalChatAccessService);
  });

  it('allows professional without trial or payment', async () => {
    prisma.userProfile.findUnique.mockResolvedValue({
      role: OnboardingUserRole.professional,
      personalTrialMessagesUsed: 3,
      personalTrialExhaustedAt: new Date(),
    });
    const state = await svc.getAccessState('doc-1');
    expect(state.personalChatAllowed).toBe(true);
    await expect(svc.assertCanSendPersonalMessage('doc-1')).resolves.toBeUndefined();
  });

  it('allows personal user with trial remaining', async () => {
    prisma.userProfile.findUnique.mockResolvedValue({
      role: OnboardingUserRole.personal,
      personalTrialMessagesUsed: 1,
      personalTrialExhaustedAt: null,
    });
    const state = await svc.getAccessState('u1');
    expect(state.trial.remaining).toBe(2);
    expect(state.personalChatAllowed).toBe(true);
    expect(state.personalChatReadOnly).toBe(false);
    await expect(svc.assertCanSendPersonalMessage('u1')).resolves.toBeUndefined();
  });

  it('blocks send when trial exhausted', async () => {
    prisma.userProfile.findUnique.mockResolvedValue({
      role: OnboardingUserRole.personal,
      personalTrialMessagesUsed: 3,
      personalTrialExhaustedAt: new Date(),
    });
    const state = await svc.getAccessState('u1');
    expect(state.personalChatReadOnly).toBe(true);
    expect(state.personalChatAllowed).toBe(false);
    await expect(svc.assertCanSendPersonalMessage('u1')).rejects.toMatchObject({
      response: expect.objectContaining({
        error: 'assistant_trial_exhausted',
      }),
    });
  });

  it('allows read history when trial exhausted', async () => {
    prisma.userProfile.findUnique.mockResolvedValue({
      role: OnboardingUserRole.personal,
      personalTrialMessagesUsed: 3,
      personalTrialExhaustedAt: new Date(),
    });
    await expect(
      svc.assertCanReadPersonalChatHistory('u1'),
    ).resolves.toBeUndefined();
  });

  it('allows send when paid pass is active', async () => {
    prisma.userProfile.findUnique.mockResolvedValue({
      role: OnboardingUserRole.personal,
      personalTrialMessagesUsed: 3,
      personalTrialExhaustedAt: new Date(),
    });
    prisma.userAssistantAccess.findFirst.mockResolvedValue({
      id: 'pass',
      status: AssistantAccessStatus.active,
      endsAt: new Date(Date.now() + 86_400_000),
    });
    const state = await svc.getAccessState('u1');
    expect(state.paidActive).toBe(true);
    expect(state.personalChatAllowed).toBe(true);
    await expect(svc.assertCanSendPersonalMessage('u1')).resolves.toBeUndefined();
  });

  it('increments trial usage for personal patient', async () => {
    prisma.userProfile.findUnique
      .mockResolvedValueOnce({
        role: OnboardingUserRole.personal,
        personalTrialMessagesUsed: 0,
        personalTrialExhaustedAt: null,
      })
      .mockResolvedValueOnce({
        personalTrialMessagesUsed: 1,
        personalTrialExhaustedAt: null,
      });
    await svc.recordTrialUsageIfNeeded('u1');
    expect(prisma.userProfile.updateMany).toHaveBeenCalled();
  });

  it('throws ForbiddenException with trial payload shape', async () => {
    prisma.userProfile.findUnique.mockResolvedValue({
      role: OnboardingUserRole.personal,
      personalTrialMessagesUsed: 3,
      personalTrialExhaustedAt: new Date(),
    });
    try {
      await svc.assertCanSendPersonalMessage('u1');
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      const body = (e as ForbiddenException).getResponse() as Record<
        string,
        unknown
      >;
      expect(body.error).toBe('assistant_trial_exhausted');
      expect(body.trial).toEqual({ limit: 3, used: 3, remaining: 0 });
    }
  });
});
