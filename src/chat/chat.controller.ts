import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { OptionalUser } from '../auth/decorators/optional-user.decorator';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt.guard';
import { ChatCompletionService } from './chat-completion.service';
import { ChatReadService } from './chat-read.service';
import { ChatService } from './chat.service';
import { ChatConversationsQueryDto } from './dto/chat-conversations-query.dto';
import { ChatMessagesQueryDto } from './dto/chat-messages-query.dto';
import { ChatReplyDto } from './dto/chat-reply.dto';
import { PostGeneralMessageDto } from './dto/post-general-message.dto';
import { PostGeneralMessageResponseDto } from './dto/post-general-message-response.dto';
import { PostPersonalMessageDto } from './dto/post-personal-message.dto';
import { PostPersonalMessageResponseDto } from './dto/post-personal-message-response.dto';
import { ReportIssueDto } from './dto/report-issue.dto';
import { ChatGeneralRateGuard } from './guards/chat-general-rate.guard';
import { PersonalChatAccessService } from '../payments/personal-chat-access.service';

function sseErrorPayload(e: unknown): {
  error: { code: string; message: string };
} {
  if (e instanceof HttpException) {
    const s = e.getStatus();
    const r = e.getResponse();
    const raw =
      typeof r === 'string'
        ? r
        : typeof r === 'object' && r && 'message' in r
          ? (r as { message: string | string[] }).message
          : e.message;
    const message = Array.isArray(raw) ? (raw[0] ?? e.message) : String(raw);
    const code =
      s === 504
        ? 'llm_timeout'
        : s === 503
          ? 'llm_unavailable'
          : s === 502
            ? 'bad_gateway'
            : s === 429
              ? 'rate_limited'
              : `http_${s}`;
    return { error: { code, message } };
  }
  const m = (e as Error)?.message || 'error';
  return { error: { code: 'internal', message: m } };
}

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly chatCompletion: ChatCompletionService,
    private readonly chatRead: ChatReadService,
    private readonly personalChatAccess: PersonalChatAccessService,
  ) {}

  @Get('config')
  @ApiOperation({
    summary: 'Chat history seed & doctor types (GET /api/chat/config)',
  })
  getConfig() {
    return this.chat.getConfig();
  }

  @Get('conversations')
  @UseGuards(AuthGuard('jwt'), ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'List personal chat threads (JWT `sub` only; no userId in query)',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated personal `ChatConversation` list',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  listConversations(
    @CurrentUser() user: RequestUser,
    @Query() q: ChatConversationsQueryDto,
  ) {
    return this.personalChatAccess
      .assertCanReadPersonalChatHistory(user.id)
      .then(() =>
        this.chatRead.listPersonalConversations(
          user.id,
          q.page ?? 1,
          q.pageSize ?? 20,
          q.patientUserId,
        ),
      );
  }

  @Get('conversations/:conversationId/messages')
  @UseGuards(AuthGuard('jwt'), ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiBearerAuth('access-token')
  @ApiParam({ name: 'conversationId', format: 'uuid' })
  @ApiOperation({
    summary:
      'Paginated messages for a personal thread (only if `conversationId` belongs to JWT sub)',
  })
  @ApiResponse({ status: 200, description: 'Chronological messages' })
  @ApiResponse({ status: 404, description: 'Not found or not owned' })
  getConversationMessages(
    @CurrentUser() user: RequestUser,
    @Param('conversationId') conversationId: string,
    @Query() q: ChatMessagesQueryDto,
  ) {
    return this.personalChatAccess
      .assertCanReadPersonalChatHistory(user.id)
      .then(() =>
        this.chatRead.getPersonalMessages(
          user.id,
          conversationId,
          q.limit ?? 30,
          q.before,
        ),
      );
  }

  @Post('personal/messages')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'), ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      'Personalized chat (JWT; uses UserProfile + medicalHistory on server)',
    description:
      'Does not accept profile from the client. `LLM_API_KEY=dummy` (or unset) returns a dev placeholder until a real key is set.',
  })
  @ApiResponse({ status: 200, type: PostPersonalMessageResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({
    status: 404,
    description: 'Onboarding not completed or unknown conversation',
  })
  @ApiResponse({ status: 502, description: 'Upstream LLM / gateway' })
  @ApiResponse({ status: 503, description: 'LLM rate-limited' })
  @ApiResponse({ status: 504, description: 'LLM timeout' })
  @ApiResponse({ status: 429, description: 'Throttled or daily cap' })
  postPersonal(
    @CurrentUser() user: RequestUser,
    @Body() dto: PostPersonalMessageDto,
  ): Promise<PostPersonalMessageResponseDto> {
    return this.personalChatAccess
      .assertCanSendPersonalMessage(user.id)
      .then(() => this.chatCompletion.sendPersonal(user.id, dto));
  }

  @Post('personal/messages/stream')
  @UseGuards(AuthGuard('jwt'), ThrottlerGuard)
  @Throttle({ default: { limit: 15, ttl: 60_000 } })
  @ApiBearerAuth('access-token')
  @ApiBody({ type: PostPersonalMessageDto })
  @ApiOperation({
    summary:
      'Personalized chat (SSE) — `data: {"token":...}` lines, then done + [DONE]',
    description:
      'On provider failure after 200, one `data: {"error":{"code","message"}}` line; then connection closes. No PHI in `error` fields.',
  })
  @ApiResponse({ status: 200, description: 'text/event-stream' })
  @ApiResponse({ status: 401, description: 'Before any SSE body' })
  @ApiResponse({ status: 502, description: 'In-stream LLM / gateway' })
  @ApiResponse({ status: 503, description: 'In-stream LLM unavailable' })
  @ApiResponse({ status: 504, description: 'In-stream LLM timeout' })
  async streamPersonal(
    @CurrentUser() user: RequestUser,
    @Body() dto: PostPersonalMessageDto,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.status(200);
    try {
      await this.personalChatAccess.assertCanSendPersonalMessage(user.id);
      const out = await this.chatCompletion.runPersonalStream(
        user.id,
        dto,
        (chunk) => {
          res.write(`data: ${JSON.stringify({ token: chunk })}\n\n`);
        },
      );
      res.write(
        `data: ${JSON.stringify({
          done: true,
          conversationId: out.conversationId,
          messageId: out.messageId,
          citations: out.citations,
        })}\n\n`,
      );
      res.write('data: [DONE]\n\n');
    } catch (e) {
      res.write(`data: ${JSON.stringify(sseErrorPayload(e))}\n\n`);
    } finally {
      res.end();
    }
  }

  @Post('general/messages')
  @HttpCode(HttpStatus.OK)
  @UseGuards(OptionalJwtAuthGuard, ChatGeneralRateGuard, ThrottlerGuard)
  @SkipThrottle()
  @ApiOperation({
    summary: 'General health chat (no user profile in the model)',
    description:
      'Bearer token is optional. Anonymous clients are throttled by IP (see `CHAT_ANON_GENERAL_RPM`); authed by `userId` (`CHAT_AUTH_GENERAL_RPM`). Trust `X-Forwarded-For` only behind a trusted reverse proxy. User record is never loaded or injected into the LLM context.',
  })
  @ApiResponse({ status: 200, type: PostGeneralMessageResponseDto })
  @ApiResponse({ status: 502, description: 'Upstream LLM' })
  @ApiResponse({ status: 503, description: 'LLM rate-limited' })
  @ApiResponse({ status: 504, description: 'LLM timeout' })
  @ApiResponse({ status: 429, description: 'General or daily cap' })
  postGeneral(
    @Body() dto: PostGeneralMessageDto,
    @OptionalUser() user: RequestUser | undefined,
  ): Promise<PostGeneralMessageResponseDto> {
    return this.chatCompletion.sendGeneral(dto, user?.id);
  }

  @Post('general/messages/stream')
  @UseGuards(OptionalJwtAuthGuard, ChatGeneralRateGuard, ThrottlerGuard)
  @SkipThrottle()
  @ApiBody({ type: PostGeneralMessageDto })
  @ApiOperation({
    summary:
      'General chat (SSE) — no profile; optional Bearer for per-user cap',
  })
  @ApiResponse({ status: 200, description: 'text/event-stream' })
  @ApiResponse({ status: 502, description: 'In-stream' })
  @ApiResponse({ status: 503, description: 'In-stream' })
  @ApiResponse({ status: 504, description: 'In-stream' })
  async streamGeneral(
    @Body() dto: PostGeneralMessageDto,
    @OptionalUser() user: RequestUser | undefined,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.status(200);
    try {
      const out = await this.chatCompletion.runGeneralStream(
        dto,
        user?.id,
        (chunk) => {
          res.write(`data: ${JSON.stringify({ token: chunk })}\n\n`);
        },
      );
      res.write(
        `data: ${JSON.stringify({
          done: true,
          reply: out.reply,
          messageId: out.messageId,
          citations: out.citations,
        })}\n\n`,
      );
      res.write('data: [DONE]\n\n');
    } catch (e) {
      res.write(`data: ${JSON.stringify(sseErrorPayload(e))}\n\n`);
    } finally {
      res.end();
    }
  }

  @Post('reply')
  @HttpCode(HttpStatus.GONE)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Deprecated — use JSON chat endpoints (410 Gone)',
    description:
      'Replaced by `POST /api/chat/personal/messages` (with JWT) and `POST /api/chat/general/messages`. OpenAPI: see **chat** tag; interactive docs: `GET /api/docs`.',
    deprecated: true,
  })
  @ApiResponse({
    status: 410,
    description:
      'Body explains migration. Valid JSON body still required for schema validation; invalid body returns 400 first.',
  })
  @ApiBody({ type: ChatReplyDto })
  postReply(@Body() _dto: ChatReplyDto) {
    throw new HttpException(
      {
        error: 'gone',
        message:
          'This legacy endpoint is removed. Use POST /api/chat/personal/messages (JWT) or POST /api/chat/general/messages.',
        migration: {
          personalJson: 'POST /api/chat/personal/messages',
          generalJson: 'POST /api/chat/general/messages',
          apiDocs: 'GET /api/docs',
        },
      },
      HttpStatus.GONE,
    );
  }

  @Post('report-issue')
  @HttpCode(200)
  @UseGuards(OptionalJwtAuthGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Store support / issue report',
    description:
      'Public. Send optional `Authorization: Bearer` to attach the report to the signed-in user (`userId`); otherwise `userId` is null.',
  })
  @ApiBody({ type: ReportIssueDto })
  @ApiResponse({ status: 200 })
  postReport(
    @Body() dto: ReportIssueDto,
    @OptionalUser() user: RequestUser | undefined,
  ) {
    return this.chat.reportIssue(dto.message, user?.id);
  }
}
