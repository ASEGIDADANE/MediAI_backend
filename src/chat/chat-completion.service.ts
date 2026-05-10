import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import {
  ChatMessageRole,
  ChatThreadKind,
  OnboardingUserRole,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildLlmRequestMessages,
  historyFromDbRows,
} from './chat-message-history.util';
import {
  CHAT_NO_USER_RECORD,
  CHAT_PERSONAL_EXTRA,
  CHAT_SAFETY_AND_STYLE,
} from './chat-constants';
import { LlmService, type LlmMessage } from './llm.service';
import { RagService, type Citation } from './rag.service';
import { UserContextService } from './user-context.service';
import { ChatQuotaService } from './chat-quota.service';

@Injectable()
export class ChatCompletionService {
  private readonly log = new Logger(ChatCompletionService.name);
  private readonly maxHistoryContextChars: number;
  private readonly maxHistoryPairs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly userContext: UserContextService,
    private readonly rag: RagService,
    private readonly llm: LlmService,
    private readonly config: ConfigService,
    private readonly quota: ChatQuotaService,
  ) {
    this.maxHistoryContextChars = Number(
      this.config.get('CHAT_MAX_HISTORY_CHARS', '24000') || 24_000,
    );
    this.maxHistoryPairs = Number(
      this.config.get('CHAT_MAX_HISTORY_PAIRS', '20') || 20,
    );
  }

  async sendPersonal(
    userId: string,
    input: {
      message: string;
      conversationId?: string;
      patientUserId?: string;
    },
  ): Promise<{
    reply: string;
    conversationId: string;
    messageId: string;
    citations?: Citation[];
  }> {
    return this.runPersonalJson(userId, input);
  }

  async runPersonalStream(
    userId: string,
    input: {
      message: string;
      conversationId?: string;
      patientUserId?: string;
    },
    onToken: (chunk: string) => void,
  ): Promise<{
    reply: string;
    conversationId: string;
    messageId: string;
    citations?: Citation[];
  }> {
    return this.runPersonalJson(userId, input, onToken);
  }

  private async runPersonalJson(
    userId: string,
    input: {
      message: string;
      conversationId?: string;
      patientUserId?: string;
    },
    onToken?: (chunk: string) => void,
  ): Promise<{
    reply: string;
    conversationId: string;
    messageId: string;
    citations?: Citation[];
  }> {
    const t0 = Date.now();
    const requestId = randomUUID();
    const message = this.requireMessage(input.message);
    this.quota.ensureCanSend(userId, 'personal');

    // Subject of the chat: by default the caller themselves, but a professional
    // can ask the assistant about one of their patients via `patientUserId`.
    const subject = await this.resolveSubject(userId, input.patientUserId);

    const userBlock = this.userContext.buildFromUserProfile(subject.profile);
    const citations = await this.rag.retrieve(message, 'personal');
    const system = this.assembleSystemPersonal(
      userBlock,
      citations,
      subject.kind === 'patient',
    );

    const conversation = await this.resolveOrCreatePersonalConversation(
      userId,
      input.conversationId,
      subject.kind === 'patient' ? subject.profile.userId : undefined,
    );

    try {
      await this.saveMessage(conversation.id, ChatMessageRole.user, message);

      const llmMessages = await this.loadLlmMessages(system, conversation.id);

      let text: string;
      let modelLabel = 'stream';
      let usage: object | undefined;
      if (onToken) {
        let acc = '';
        for await (const t of this.llm.streamWithMessages(llmMessages)) {
          acc += t;
          onToken(t);
        }
        text = acc;
      } else {
        const r = await this.llm.completeWithMessages(llmMessages);
        text = r.text;
        modelLabel = r.model;
        usage = r.usage;
      }

      const assistant = await this.prisma.chatMessage.create({
        data: {
          conversationId: conversation.id,
          role: ChatMessageRole.assistant,
          content: text,
          metadata: {
            requestId,
            model: modelLabel,
            usage,
            mode: 'personal' as const,
          },
        },
      });

      this.quota.recordCompletedTurn(userId, 'personal');
      this.logChatEvent({
        requestId,
        mode: 'personal',
        userId,
        stream: Boolean(onToken),
        ms: Date.now() - t0,
        llmModel: modelLabel,
        ragHits: citations.length,
        status: 'ok',
        conversationId: conversation.id,
      });

      return {
        reply: text,
        conversationId: conversation.id,
        messageId: assistant.id,
        citations: citations.length ? citations : undefined,
      };
    } catch (e) {
      this.logChatEvent({
        requestId,
        mode: 'personal',
        userId,
        stream: Boolean(onToken),
        ms: Date.now() - t0,
        llmModel: 'unknown',
        ragHits: citations.length,
        status: 'error',
        conversationId: conversation.id,
        err: e,
      });
      throw e;
    }
  }

  /**
   * **Never** loads or injects `UserProfile` or user medical data — `optionalUserId` is for logging / DB ownership only.
   */
  async sendGeneral(
    input: {
      message: string;
      sessionId?: string;
    },
    optionalUserId?: string,
  ): Promise<{ reply: string; citations?: Citation[]; messageId: string }> {
    return this.runGeneralJson(input, optionalUserId);
  }

  async runGeneralStream(
    input: { message: string; sessionId?: string },
    optionalUserId: string | undefined,
    onToken: (chunk: string) => void,
  ): Promise<{ reply: string; citations?: Citation[]; messageId: string }> {
    return this.runGeneralJson(input, optionalUserId, onToken);
  }

  private async runGeneralJson(
    input: { message: string; sessionId?: string },
    optionalUserId: string | undefined,
    onToken?: (chunk: string) => void,
  ): Promise<{ reply: string; citations?: Citation[]; messageId: string }> {
    const t0 = Date.now();
    const requestId = randomUUID();
    const message = this.requireMessage(input.message);
    this.quota.ensureCanSend(optionalUserId, 'general');

    const citations = await this.rag.retrieve(message, 'general');
    const system = this.assembleSystemGeneral(citations);

    const conversation = await this.resolveOrCreateGeneralConversation(
      input.sessionId,
      optionalUserId,
    );

    try {
      await this.saveMessage(conversation.id, ChatMessageRole.user, message);

      const llmMessages = await this.loadLlmMessages(system, conversation.id);

      let text: string;
      let modelLabel = 'stream';
      let usage: object | undefined;
      if (onToken) {
        let acc = '';
        for await (const t of this.llm.streamWithMessages(llmMessages)) {
          acc += t;
          onToken(t);
        }
        text = acc;
      } else {
        const r = await this.llm.completeWithMessages(llmMessages);
        text = r.text;
        modelLabel = r.model;
        usage = r.usage;
      }

      const assistantRow = await this.prisma.chatMessage.create({
        data: {
          conversationId: conversation.id,
          role: ChatMessageRole.assistant,
          content: text,
          metadata: {
            requestId,
            model: modelLabel,
            usage,
            mode: 'general' as const,
          },
        },
      });

      this.quota.recordCompletedTurn(optionalUserId, 'general');
      this.logChatEvent({
        requestId,
        mode: 'general',
        userId: optionalUserId,
        stream: Boolean(onToken),
        ms: Date.now() - t0,
        llmModel: modelLabel,
        ragHits: citations.length,
        status: 'ok',
        conversationId: conversation.id,
      });

      return {
        reply: text,
        citations: citations.length ? citations : undefined,
        messageId: assistantRow.id,
      };
    } catch (e) {
      this.logChatEvent({
        requestId,
        mode: 'general',
        userId: optionalUserId,
        stream: Boolean(onToken),
        ms: Date.now() - t0,
        llmModel: 'unknown',
        ragHits: citations.length,
        status: 'error',
        conversationId: conversation.id,
        err: e,
      });
      throw e;
    }
  }

  private async loadLlmMessages(
    systemPrompt: string,
    conversationId: string,
  ): Promise<LlmMessage[]> {
    const rows = await this.prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: { role: true, content: true },
    });
    const hist = historyFromDbRows(rows, this.maxHistoryPairs);
    return buildLlmRequestMessages(
      systemPrompt,
      hist,
      this.maxHistoryContextChars,
    );
  }

  private requireMessage(s: string): string {
    if (s.length > 8_000) {
      throw new BadRequestException(
        'message exceeds max length (8000 characters)',
      );
    }
    const t = s.trim().replace(/\0/g, '');
    if (!t) {
      throw new BadRequestException('message is required or invalid');
    }
    return t;
  }

  private assembleSystemPersonal(
    userBlock: string,
    citations: Citation[],
    aboutPatient = false,
  ): string {
    const parts = [
      CHAT_SAFETY_AND_STYLE,
      aboutPatient
        ? `${CHAT_PERSONAL_EXTRA}\n\nThe caller is a healthcare professional asking about their patient. Treat the user-context block below as the *patient's* record (not the caller's). Provide clinical decision support, not direct-to-consumer advice. Be concise and clinically focused.`
        : CHAT_PERSONAL_EXTRA,
      userBlock,
    ];
    if (citations.length) {
      parts.push('Relevant guidelines (retrieved):');
      for (const c of citations) {
        parts.push(`- [${c.source}] ${c.excerpt}`);
      }
    }
    return parts.join('\n\n');
  }

  private assembleSystemGeneral(citations: Citation[]): string {
    const parts = [CHAT_SAFETY_AND_STYLE, CHAT_NO_USER_RECORD];
    if (citations.length) {
      parts.push('Relevant guidelines (retrieved):');
      for (const c of citations) {
        parts.push(`- [${c.source}] ${c.excerpt}`);
      }
    }
    return parts.join('\n\n');
  }

  private async resolveOrCreatePersonalConversation(
    userId: string,
    conversationId?: string,
    patientUserId?: string,
  ) {
    if (conversationId) {
      const c = await this.prisma.chatConversation.findFirst({
        where: {
          id: conversationId,
          userId,
          kind: ChatThreadKind.personal,
        },
      });
      if (!c) {
        throw new NotFoundException('Conversation not found');
      }
      // Switching subjects mid-thread would silently leak the wrong patient's
      // context; reject so the client must start a new thread per patient.
      if ((c.patientUserId ?? null) !== (patientUserId ?? null)) {
        throw new BadRequestException(
          'patientUserId does not match the existing conversation',
        );
      }
      return c;
    }
    return this.prisma.chatConversation.create({
      data: {
        kind: ChatThreadKind.personal,
        userId,
        patientUserId: patientUserId ?? null,
      },
    });
  }

  /**
   * For a personal chat, resolve whose UserProfile to feed the LLM.
   *
   * - Self chat (`patientUserId` omitted): caller's own profile.
   *   Throws 404 if the caller hasn't completed onboarding.
   * - Doctor about patient (`patientUserId` set): caller must be a
   *   professional, the patient must exist with a personal profile, and the
   *   doctor cannot point at themselves.
   */
  private async resolveSubject(
    callerUserId: string,
    patientUserId: string | undefined,
  ): Promise<
    | {
        kind: 'self';
        profile: import('../generated/prisma/client').UserProfile;
      }
    | {
        kind: 'patient';
        profile: import('../generated/prisma/client').UserProfile;
      }
  > {
    if (!patientUserId) {
      const profile = await this.prisma.userProfile.findUnique({
        where: { userId: callerUserId },
      });
      if (!profile) {
        throw new NotFoundException(
          'Complete onboarding to use personalized chat.',
        );
      }
      return { kind: 'self', profile };
    }

    if (patientUserId === callerUserId) {
      throw new BadRequestException(
        'patientUserId cannot equal the caller (use self-chat instead).',
      );
    }

    // Caller must be a professional to ask the assistant about another user.
    const callerProfile = await this.prisma.userProfile.findUnique({
      where: { userId: callerUserId },
      select: { role: true },
    });
    if (
      !callerProfile ||
      callerProfile.role !== OnboardingUserRole.professional
    ) {
      throw new ForbiddenException(
        'Only professional users can ask the assistant about a patient.',
      );
    }

    // Patient must exist with a personal profile.
    const patientProfile = await this.prisma.userProfile.findUnique({
      where: { userId: patientUserId },
    });
    if (
      !patientProfile ||
      patientProfile.role !== OnboardingUserRole.personal
    ) {
      throw new NotFoundException('Patient not found.');
    }

    return { kind: 'patient', profile: patientProfile };
  }

  private async resolveOrCreateGeneralConversation(
    sessionId: string | undefined,
    optionalUserId: string | undefined,
  ) {
    if (sessionId) {
      const c = await this.prisma.chatConversation.findFirst({
        where: {
          kind: ChatThreadKind.general,
          clientSessionId: sessionId,
          userId: optionalUserId ?? null,
        },
      });
      if (c) {
        return c;
      }
    }
    return this.prisma.chatConversation.create({
      data: {
        kind: ChatThreadKind.general,
        userId: optionalUserId ?? null,
        clientSessionId: sessionId ?? randomUUID(),
      },
    });
  }

  private saveMessage(
    conversationId: string,
    role: ChatMessageRole,
    content: string,
  ) {
    return this.prisma.chatMessage.create({
      data: { conversationId, role, content },
    });
  }

  private logChatEvent(p: {
    requestId: string;
    mode: 'personal' | 'general';
    userId?: string;
    stream: boolean;
    ms: number;
    llmModel: string;
    ragHits: number;
    status: 'ok' | 'error';
    conversationId: string;
    err?: unknown;
  }): void {
    const http = (() => {
      const e = p.err;
      if (e instanceof HttpException) {
        return String(e.getStatus());
      }
      if (e instanceof Error && e.name) {
        return e.name;
      }
      return p.status === 'ok' ? '200' : 'error';
    })();
    this.log.log(
      JSON.stringify({
        event: 'chat_response',
        requestId: p.requestId,
        mode: p.mode,
        userId: p.userId ?? null,
        stream: p.stream,
        ms: p.ms,
        llmModel: p.llmModel,
        ragHits: p.ragHits,
        status: p.status,
        httpStatus: http,
        conversationId: p.conversationId,
      }),
    );
  }
}
