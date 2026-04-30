import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class PostThreadMessageDto {
  @ApiProperty({
    example: 'Hello doctor — I had a question about my prescription.',
    minLength: 1,
    maxLength: 4000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body: string;
}
