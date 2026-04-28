import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChatCitationDto } from './chat-citation.dto';

export class PostGeneralMessageResponseDto {
  @ApiProperty()
  reply: string;

  @ApiProperty({ description: 'ID of the persisted assistant message' })
  messageId: string;

  @ApiPropertyOptional({ type: [ChatCitationDto] })
  citations?: ChatCitationDto[];
}
