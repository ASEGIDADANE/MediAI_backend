import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserPublicDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'email' })
  email: string;

  @ApiProperty({
    description:
      'True if the email is verified (e.g. Google sign-in or future email link flow).',
  })
  emailVerified: boolean;

  @ApiPropertyOptional({
    nullable: true,
    description: 'ISO 8601 time of last successful login (password or OAuth).',
  })
  lastLoginAt: string | null;
}
