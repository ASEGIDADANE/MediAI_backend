import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

const MODES = ['personal', 'general'] as const;

export class ChatReplyDto {
  @ApiProperty({ enum: MODES })
  @IsIn([...MODES])
  mode: (typeof MODES)[number];

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(12_000)
  message: string;
}
