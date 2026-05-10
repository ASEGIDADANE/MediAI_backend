import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ChatThreadKind, OnboardingUserRole } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChatCompletionService } from './chat-completion.service';
import { ChatQuotaService } from './chat-quota.service';
import { LlmService } from './llm.service';
import { RagService } from './rag.service';
import { UserContextService } from './user-context.service';

const quotaMock = {
  ensureCanSend: jest.fn(),
  recordCompletedTurn: jest.fn(),
};

function prismaMock(over: Partial<Record<string, unknown>> = {}) {
  return {
    userProfile: { findUnique: jest.fn() },
    chatConversation: { findFirst: jest.fn(), create: jest.fn() },
    chatMessage: { findMany: jest.fn(), create: jest.fn() },
    ...over,
  };
}

describe('ChatCompletionService — general', () => {
  it('does not call UserContextService when sending general', async () => {
    const build = jest.fn(() => 'SHOULD_NOT_RUN');
    const userContext = { buildFromUserProfile: build };
    const prisma = prismaMock();
    prisma.userProfile.findUnique = jest.fn();

    prisma.chatConversation.findFirst = jest.fn(() => null);
    prisma.chatConversation.create = jest.fn(() =>
      Promise.resolve({
        id: 'c1',
        kind: ChatThreadKind.general,
        userId: null,
        clientSessionId: 's',
      }),
    );
    prisma.chatMessage.findMany = jest.fn(() => [
      { role: 'user' as const, content: 'Hello general' },
    ]);
    prisma.chatMessage.create = jest
      .fn()
      .mockResolvedValueOnce({ id: 'um' })
      .mockResolvedValueOnce({ id: 'am' });

    const rag = { retrieve: jest.fn(() => Promise.resolve([])) };
    const llm = {
      completeWithMessages: jest.fn(() =>
        Promise.resolve({ text: 'ok', model: 'dummy' }),
      ),
    };

    const m = await Test.createTestingModule({
      providers: [
        ChatCompletionService,
        { provide: PrismaService, useValue: prisma },
        { provide: UserContextService, useValue: userContext },
        { provide: RagService, useValue: rag },
        { provide: LlmService, useValue: llm },
        {
          provide: ConfigService,
          useValue: { get: (_k: string, d?: string) => d },
        },
        { provide: ChatQuotaService, useValue: quotaMock },
      ],
    }).compile();

    const svc = m.get(ChatCompletionService);
    const out = await svc.sendGeneral({ message: 'Hello general' }, undefined);

    expect(out.reply).toBe('ok');
    expect(out.messageId).toBe('am');
    expect(build).not.toHaveBeenCalled();
    expect(prisma.userProfile.findUnique).not.toHaveBeenCalled();
  });
});

describe('ChatCompletionService — clinical assistant (patientUserId)', () => {
  function makeService(
    prisma: ReturnType<typeof prismaMock>,
    userContextBuild = jest.fn(() => 'PATIENT_BLOCK'),
  ) {
    const userContext = { buildFromUserProfile: userContextBuild };
    const rag = { retrieve: jest.fn(() => Promise.resolve([])) };
    const llm = {
      completeWithMessages: jest.fn(() =>
        Promise.resolve({ text: 'reply', model: 'dummy' }),
      ),
    };
    return Test.createTestingModule({
      providers: [
        ChatCompletionService,
        { provide: PrismaService, useValue: prisma },
        { provide: UserContextService, useValue: userContext },
        { provide: RagService, useValue: rag },
        { provide: LlmService, useValue: llm },
        {
          provide: ConfigService,
          useValue: { get: (_k: string, d?: string) => d },
        },
        { provide: ChatQuotaService, useValue: quotaMock },
      ],
    })
      .compile()
      .then((m) => ({
        svc: m.get(ChatCompletionService),
        userContextBuild,
      }));
  }

  it('rejects non-professional callers asking about a patient', async () => {
    const prisma = prismaMock();
    prisma.userProfile.findUnique = jest
      .fn()
      .mockResolvedValueOnce({ role: OnboardingUserRole.personal }); // caller is patient
    const { svc } = await makeService(prisma);

    await expect(
      svc.sendPersonal('caller-1', {
        message: 'about my friend',
        patientUserId: '11111111-2222-4333-8444-555555555555',
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(quotaMock.ensureCanSend).toHaveBeenCalled();
  });

  it("feeds the patient's profile to the LLM (not the doctor's) and tags the conversation", async () => {
    const prisma = prismaMock();
    const patientId = '11111111-2222-4333-8444-555555555555';
    prisma.userProfile.findUnique = jest
      .fn()
      // 1st: caller role check (must be professional)
      .mockResolvedValueOnce({ role: OnboardingUserRole.professional })
      // 2nd: load patient profile
      .mockResolvedValueOnce({
        userId: patientId,
        role: OnboardingUserRole.personal,
        preferredName: 'Aisha',
      });
    prisma.chatConversation.findFirst = jest.fn(() => null);
    prisma.chatConversation.create = jest.fn(() =>
      Promise.resolve({
        id: 'c-doc-pat',
        kind: ChatThreadKind.personal,
        userId: 'doc-1',
        patientUserId: patientId,
      }),
    );
    prisma.chatMessage.findMany = jest.fn(() => [
      { role: 'user' as const, content: 'Hi' },
    ]);
    prisma.chatMessage.create = jest
      .fn()
      .mockResolvedValueOnce({ id: 'um' })
      .mockResolvedValueOnce({ id: 'am' });

    const build = jest.fn(() => 'PATIENT_BLOCK_AISHA');
    const { svc } = await makeService(prisma, build);

    const out = await svc.sendPersonal('doc-1', {
      message: 'differential for headache?',
      patientUserId: patientId,
    });

    expect(out.reply).toBe('reply');
    expect(out.conversationId).toBe('c-doc-pat');
    expect(build).toHaveBeenCalledWith(
      expect.objectContaining({ userId: patientId }),
    );
    expect(prisma.chatConversation.create).toHaveBeenCalledWith({
      data: {
        kind: ChatThreadKind.personal,
        userId: 'doc-1',
        patientUserId: patientId,
      },
    });
  });

  it('rejects switching subjects mid-conversation', async () => {
    const prisma = prismaMock();
    const patientId = '11111111-2222-4333-8444-555555555555';
    const otherPatientId = '22222222-3333-4444-8555-666666666666';
    prisma.userProfile.findUnique = jest
      .fn()
      .mockResolvedValueOnce({ role: OnboardingUserRole.professional })
      .mockResolvedValueOnce({
        userId: patientId,
        role: OnboardingUserRole.personal,
      });
    // Existing conversation belongs to a *different* patient.
    prisma.chatConversation.findFirst = jest.fn(() =>
      Promise.resolve({
        id: 'c-existing',
        userId: 'doc-1',
        patientUserId: otherPatientId,
        kind: ChatThreadKind.personal,
      }),
    );

    const { svc } = await makeService(prisma);

    await expect(
      svc.sendPersonal('doc-1', {
        message: 'note',
        conversationId: 'c-existing',
        patientUserId: patientId,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
