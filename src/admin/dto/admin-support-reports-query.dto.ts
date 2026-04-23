import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { AdminPaginationQueryDto } from './admin-pagination-query.dto';

export class AdminSupportReportsQueryDto extends AdminPaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Filter by submitter user id' })
  @IsOptional()
  @IsString()
  @IsUUID('4')
  userId?: string;
}
