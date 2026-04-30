import { Injectable } from '@nestjs/common';
import { getChatConfigSnapshot } from '../config/chat.snapshot';
import { chatReplyAuthor, getReplyForMode, type ChatMode } from '../config/chat-reply.util';
import { PrismaService } from '../prisma/prisma.service';
import { RagService } from './rag.service';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rag: RagService,
  ) {}

  getConfig() {
    return {
      ...getChatConfigSnapshot(),
      /** True when `RAG_ENABLED=true` and the API may attach guideline citations to chat */
      ragEnabled: this.rag.isEnabled(),
    };
  }

  getReply(mode: ChatMode, message: string) {
    return {
      reply: getReplyForMode(mode, message),
      author: chatReplyAuthor(mode),
    };
  }

  async reportIssue(message: string, userId: string | undefined) {
    await this.prisma.supportReport.create({
      data: {
        message: message.trim(),
        userId: userId ?? null,
      },
    });
    return { success: true as const };
  }
}
