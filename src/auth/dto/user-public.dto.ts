import { ApiProperty } from '@nestjs/swagger';

export class UserPublicDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'email' })
  email: string;
}
