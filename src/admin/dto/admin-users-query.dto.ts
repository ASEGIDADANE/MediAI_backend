import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { AdminPaginationQueryDto } from './admin-pagination-query.dto';

export class AdminUsersQueryDto extends AdminPaginationQueryDto {
  @ApiPropertyOptional({
    maxLength: 120,
    description: 'Filter by email (case-insensitive contains)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}
