import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ChatController } from './chat.controller';
import { ChatCompletionService } from './chat-completion.service';
import { ChatQuotaService } from './chat-quota.service';
import { ChatReadService } from './chat-read.service';
import { ChatService } from './chat.service';
import { ChatGeneralRateGuard } from './guards/chat-general-rate.guard';
import { LlmService } from './llm.service';
import { RagService } from './rag.service';
import { UserContextService } from './user-context.service';

@Module({
  imports: [PrismaModule, ConfigModule, AuthModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatCompletionService,
    ChatQuotaService,
    ChatReadService,
    ChatGeneralRateGuard,
    UserContextService,
    RagService,
    LlmService,
  ],
  exports: [ChatService, ChatCompletionService, LlmService],
})
export class ChatModule {}
