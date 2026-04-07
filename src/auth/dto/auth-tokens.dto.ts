import { ApiProperty } from '@nestjs/swagger';
import { UserPublicDto } from './user-public.dto';

export class AuthTokensDto {
  @ApiProperty({
    description: 'JWT access token (use as Authorization: Bearer <token>)',
  })
  accessToken: string;

  @ApiProperty({ type: UserPublicDto })
  user: UserPublicDto;
}
