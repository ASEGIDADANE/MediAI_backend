import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { UseGuards } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ChatService } from './chat.service';
import { ChatReplyDto } from './dto/chat-reply.dto';
import { ReportIssueDto } from './dto/report-issue.dto';

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('config')
  @ApiOperation({ summary: 'Chat history seed & doctor types (GET /api/chat/config)' })
  getConfig() {
    return this.chat.getConfig();
  }

  @Post('reply')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Mock deterministic chat reply (POST /api/chat/reply, public)' })
  @ApiResponse({ status: 200, description: '{ reply, author }' })
  @ApiBody({ type: ChatReplyDto })
  postReply(@Body() dto: ChatReplyDto) {
    return this.chat.getReply(dto.mode, dto.message);
  }

  @Post('report-issue')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Store support / issue report (public; userId null for v1)' })
  @ApiBody({ type: ReportIssueDto })
  @ApiResponse({ status: 200 })
  postReport(@Body() dto: ReportIssueDto) {
    return this.chat.reportIssue(dto.message, undefined);
  }
}
