import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Raw token from the reset link query string',
    example: 'a1b2c3...',
  })
  @IsString()
  @MinLength(32)
  token: string;

  @ApiProperty({ example: 'NewSecurePass1!', minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  @MaxLength(128)
  password: string;
}
