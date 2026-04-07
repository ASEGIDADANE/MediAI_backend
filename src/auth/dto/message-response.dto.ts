import { ApiProperty } from '@nestjs/swagger';

export class MessageResponseDto {
  @ApiProperty({ example: 'If an account exists for this email, a reset link was sent.' })
  message: string;
}
