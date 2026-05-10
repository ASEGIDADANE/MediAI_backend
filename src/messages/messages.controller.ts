import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import {
  clampThreadMessageLimit,
  ListThreadMessagesQueryDto,
} from './dto/list-thread-messages-query.dto';
import { PostThreadMessageDto } from './dto/post-thread-message.dto';
import {
  ThreadDetailDto,
  ThreadListDto,
  ThreadMessageDto,
  UnreadCountDto,
} from './dto/thread-message.dto';
import { MessagesService } from './messages.service';

/**
 * Caller-side messaging surface. The list and unread-count endpoints work for
 * both patients and doctors — the caller's `UserProfile.role` decides which
 * side of every thread they're on, so the same `/me/messages/*` URLs power
 * both inboxes and the navbar badge for everyone.
 *
 * Per-thread chat operations (`/me/messages/threads/:id`) remain
 * patient-only; doctors continue to use
 * `/professional/patients/:patientId/messages` for the chat itself.
 */
@ApiTags('me-messages')
@ApiBearerAuth('access-token')
@UseGuards(AuthGuard('jwt'))
@Controller('me/messages')
export class MessagesController {
  constructor(private readonly svc: MessagesService) {}

  @Get('threads')
  @ApiOperation({
    summary:
      'List the calling user’s message threads (most recent activity first)',
    description:
      'Role-aware: patients see threads with their doctors, doctors see threads with their patients. Empty threads with no messages yet are excluded. Each item includes the counterpart’s display name, last message preview, and the unread count from the caller’s perspective.',
  })
  @ApiResponse({ status: 200, type: ThreadListDto })
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  listThreads(@CurrentUser() user: RequestUser): Promise<ThreadListDto> {
    return this.svc.listThreads(user.id);
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'Total unread inbound messages for the caller across every thread',
    description:
      'Powers the dashboard navbar message-icon badge. Role-aware in the same way as `GET /me/messages/threads`.',
  })
  @ApiResponse({ status: 200, type: UnreadCountDto })
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  getUnreadCount(@CurrentUser() user: RequestUser): Promise<UnreadCountDto> {
    return this.svc.getUnreadCount(user.id);
  }

  @Get('threads/:threadId')
  @ApiOperation({
    summary:
      'Fetch one doctor↔patient thread the calling patient participates in',
    description:
      'Inbound (doctor → patient) messages are marked as read as a side-effect.',
  })
  @ApiParam({ name: 'threadId', description: 'DoctorPatientThread.id (UUID)' })
  @ApiResponse({ status: 200, type: ThreadDetailDto })
  @ApiResponse({
    status: 403,
    description: 'Caller is not a participant in this thread',
  })
  @ApiResponse({ status: 404, description: 'Thread not found' })
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  getThread(
    @CurrentUser() user: RequestUser,
    @Param('threadId') threadId: string,
    @Query() query: ListThreadMessagesQueryDto,
  ): Promise<ThreadDetailDto> {
    return this.svc.getThread(
      user.id,
      threadId,
      clampThreadMessageLimit(query.limit),
    );
  }

  @Post('threads/:threadId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Patient → doctor reply in an existing thread' })
  @ApiParam({ name: 'threadId', description: 'DoctorPatientThread.id (UUID)' })
  @ApiResponse({ status: 201, type: ThreadMessageDto })
  @ApiResponse({ status: 400, description: 'Empty or oversized body' })
  @ApiResponse({
    status: 403,
    description: 'Caller is not a participant in this thread',
  })
  @ApiResponse({ status: 404, description: 'Thread not found' })
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  sendMessage(
    @CurrentUser() user: RequestUser,
    @Param('threadId') threadId: string,
    @Body() dto: PostThreadMessageDto,
  ): Promise<ThreadMessageDto> {
    return this.svc.sendMessage(user.id, threadId, dto.body);
  }
}
