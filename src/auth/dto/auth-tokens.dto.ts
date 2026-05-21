import { ApiProperty } from '@nestjs/swagger';
import { UserPublicDto } from './user-public.dto';

export class AuthTokensDto {
  @ApiProperty({
    description: 'Short-lived JWT access token (use as Authorization: Bearer <token>)',
  })
  accessToken: string;

  @ApiProperty({
    description:
      'Long-lived opaque refresh token. Send to POST /auth/refresh to get a new access token. Rotate on every use.',
  })
  refreshToken: string;

  @ApiProperty({ type: UserPublicDto })
  user: UserPublicDto;
}
