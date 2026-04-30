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
} from './dto/thread-message.dto';
import { MessagesService } from './messages.service';

/**
 * Patient half of the doctor↔patient chat. Symmetric with
 * `/professional/patients/:patientId/messages` on the doctor side, but routed
 * by `threadId` because the patient discovers doctors through threads
 * (initiated by the doctor) rather than the reverse.
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
      'List the calling patient’s message threads with doctors (most recent activity first)',
    description:
      'Each item includes the doctor’s name, last message preview, and unread count of doctor → patient messages.',
  })
  @ApiResponse({ status: 200, type: ThreadListDto })
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  listThreads(@CurrentUser() user: RequestUser): Promise<ThreadListDto> {
    return this.svc.listThreads(user.id);
  }

  @Get('threads/:threadId')
  @ApiOperation({
    summary: 'Fetch one doctor↔patient thread the calling patient participates in',
    description:
      'Inbound (doctor → patient) messages are marked as read as a side-effect.',
  })
  @ApiParam({ name: 'threadId', description: 'DoctorPatientThread.id (UUID)' })
  @ApiResponse({ status: 200, type: ThreadDetailDto })
  @ApiResponse({ status: 403, description: 'Caller is not a participant in this thread' })
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
  @ApiResponse({ status: 403, description: 'Caller is not a participant in this thread' })
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
