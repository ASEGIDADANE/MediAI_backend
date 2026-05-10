import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';

/**
 * Email/password users: send `password`. Google-only (no password): send `confirm: "DELETE"`.
 */
export class DeleteAccountDto {
  @ApiPropertyOptional({
    description: 'Current password (required if account has a password)',
  })
  @ValidateIf((o: DeleteAccountDto) => o.confirm === undefined)
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'password is required for email/password accounts' })
  password?: string;

  @ApiPropertyOptional({
    enum: ['DELETE'],
    description:
      'Type DELETE to confirm (required for Google-only accounts without password)',
  })
  @ValidateIf((o: DeleteAccountDto) => o.password === undefined)
  @IsOptional()
  @IsIn(['DELETE'], {
    message: 'confirm must be DELETE for OAuth-only accounts',
  })
  confirm?: 'DELETE';
}
