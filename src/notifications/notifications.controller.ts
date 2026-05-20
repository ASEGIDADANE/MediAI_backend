import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
  NotificationItemDto,
  NotificationListResponseDto,
  NotificationUnreadCountDto,
} from './dto/notification-response.dto';
import { NotificationsQueryDto } from './dto/notifications-query.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@Controller('me/notifications')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth('access-token')
// Notifications are polled by the bell — give a generous burst limit but
// still cap so a runaway client can't hammer the DB.
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'List current user notifications (paginated, most recent first)',
  })
  @ApiResponse({ status: 200, type: NotificationListResponseDto })
  list(
    @CurrentUser() user: RequestUser,
    @Query() q: NotificationsQueryDto,
  ): Promise<NotificationListResponseDto> {
    return this.notifications.list(user.id, q);
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'Unread notification count for the current user',
    description:
      'Cheap dedicated endpoint for the bell badge — backed by a covering index.',
  })
  @ApiResponse({ status: 200, type: NotificationUnreadCountDto })
  async getUnreadCount(
    @CurrentUser() user: RequestUser,
  ): Promise<NotificationUnreadCountDto> {
    const count = await this.notifications.unreadCount(user.id);
    return { count };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark one notification as read' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiResponse({ status: 200, type: NotificationItemDto })
  markRead(
    @CurrentUser() user: RequestUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<NotificationItemDto> {
    return this.notifications.markRead(user.id, id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark every unread notification as read in one round-trip',
  })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      properties: { updated: { type: 'integer', example: 5 } },
    },
  })
  markAllRead(
    @CurrentUser() user: RequestUser,
  ): Promise<{ updated: number }> {
    return this.notifications.markAllRead(user.id);
  }
}
