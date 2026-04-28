import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ChatThreadKind } from '../generated/prisma/client';
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

    (prisma.chatConversation.findFirst as jest.Mock) = jest.fn(
      () => null,
    );
    (prisma.chatConversation.create as jest.Mock) = jest.fn(() =>
      Promise.resolve({
        id: 'c1',
        kind: ChatThreadKind.general,
        userId: null,
        clientSessionId: 's',
      }),
    );
    (prisma.chatMessage.findMany as jest.Mock) = jest.fn(() => [
      { role: 'user' as const, content: 'Hello general' },
    ]);
    (prisma.chatMessage.create as jest.Mock) = jest
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
    const out = await svc.sendGeneral(
      { message: 'Hello general' },
      undefined,
    );

    expect(out.reply).toBe('ok');
    expect(out.messageId).toBe('am');
    expect(build).not.toHaveBeenCalled();
    expect(prisma.userProfile.findUnique).not.toHaveBeenCalled();
  });
});
