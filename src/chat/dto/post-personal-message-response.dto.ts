import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChatCitationDto } from './chat-citation.dto';

export class PostPersonalMessageResponseDto {
  @ApiProperty()
  reply: string;

  @ApiProperty()
  conversationId: string;

  @ApiProperty()
  messageId: string;

  @ApiPropertyOptional({ type: [ChatCitationDto] })
  citations?: ChatCitationDto[];
}
