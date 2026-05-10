import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChatMessageRole,
  ChatThreadKind,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const PREVIEW_MAX = 200;

export type ConversationListItem = {
  id: string;
  kind: 'personal' | 'general';
  createdAt: string;
  updatedAt: string;
  lastMessagePreview?: string;
  /**
   * When set, this conversation was opened by a doctor *about* the named
   * patient (clinical assistant). Null/undefined for the caller's own chats.
   */
  patientUserId?: string | null;
};

@Injectable()
export class ChatReadService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Personal threads only: `userId` must be JWT `sub` (enforced at controller).
   *
   * `patientUserId` filters the listing to clinical-assistant conversations
   * about that one patient. Pass `undefined` to list every personal thread the
   * caller owns regardless of subject.
   */
  async listPersonalConversations(
    userId: string,
    page: number,
    pageSize: number,
    patientUserId?: string,
  ): Promise<{
    items: ConversationListItem[];
    page: number;
    pageSize: number;
    total: number;
  }> {
    const take = Math.min(100, Math.max(1, pageSize));
    const skip = Math.max(0, (Math.max(1, page) - 1) * take);
    const where: Prisma.ChatConversationWhereInput = {
      userId,
      kind: ChatThreadKind.personal,
      ...(patientUserId ? { patientUserId } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.chatConversation.count({ where }),
      this.prisma.chatConversation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: { content: true },
          },
        },
      }),
    ]);
    return {
      page: Math.max(1, page),
      pageSize: take,
      total,
      items: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        patientUserId: r.patientUserId ?? null,
        lastMessagePreview: (() => {
          const c = r.messages[0]?.content;
          if (!c) {
            return undefined;
          }
          return c.length > PREVIEW_MAX ? `${c.slice(0, PREVIEW_MAX - 1)}…` : c;
        })(),
      })),
    };
  }

  async getPersonalMessages(
    userId: string,
    conversationId: string,
    limit: number,
    beforeMessageId?: string,
  ): Promise<{
    items: {
      id: string;
      role: ChatMessageRole;
      content: string;
      createdAt: string;
    }[];
    hasMore: boolean;
  }> {
    const take = Math.min(100, Math.max(1, limit));
    const conv = await this.prisma.chatConversation.findFirst({
      where: {
        id: conversationId,
        userId,
        kind: ChatThreadKind.personal,
      },
    });
    if (!conv) {
      throw new NotFoundException('Conversation not found');
    }
    let beforeDate: Date | undefined;
    if (beforeMessageId) {
      const m = await this.prisma.chatMessage.findFirst({
        where: { id: beforeMessageId, conversationId: conv.id },
      });
      if (!m) {
        throw new BadRequestException(
          'Invalid `before` cursor (message not in conversation)',
        );
      }
      beforeDate = m.createdAt;
    }
    const pageSize = take + 1;
    const rows = await this.prisma.chatMessage.findMany({
      where: {
        conversationId: conv.id,
        ...(beforeDate ? { createdAt: { lt: beforeDate } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: pageSize,
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
      },
    });
    const hasMore = rows.length > take;
    const slice = hasMore ? rows.slice(0, take) : rows;
    return {
      hasMore,
      items: slice.reverse().map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }
}
