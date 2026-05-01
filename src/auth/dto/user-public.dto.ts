import { ApiProperty } from '@nestjs/swagger';

export class UserPublicDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'email' })
  email: string;

  @ApiProperty({ enum: ['user', 'admin'], description: 'Application role (JWT claim + profile)' })
  appRole: 'user' | 'admin';
}
