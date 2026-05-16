import { ChatService } from './chat.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RagService } from './rag.service';

describe('ChatService', () => {
  const rag = { isEnabled: () => false } as unknown as RagService;

  it('reportIssue stores trimmed message and userId when provided', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = {
      supportReport: { create },
    } as unknown as PrismaService;
    const service = new ChatService(prisma, rag);
    await service.reportIssue('  hello  ', 'user-uuid-1');
    expect(create).toHaveBeenCalledWith({
      data: { message: 'hello', userId: 'user-uuid-1' },
    });
  });

  it('reportIssue sets userId to null when anonymous', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = {
      supportReport: { create },
    } as unknown as PrismaService;
    const service = new ChatService(prisma, rag);
    await service.reportIssue('anon', undefined);
    expect(create).toHaveBeenCalledWith({
      data: { message: 'anon', userId: null },
    });
  });
});
