import { ApiProperty } from '@nestjs/swagger';

export class ChatCitationDto {
  @ApiProperty()
  source: string;

  @ApiProperty()
  excerpt: string;
}
