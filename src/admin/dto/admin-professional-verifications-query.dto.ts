import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { AdminPaginationQueryDto } from './admin-pagination-query.dto';

export type AdminVerificationFilter =
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'awaiting'
  | 'all';

/**
 * `awaiting` is the *most useful* admin default — it limits to professionals
 * whose `verificationSubmittedAt` is non-null and `verificationStatus` is
 * still pending (i.e. the queue the admin has to action).
 */
export class AdminProfessionalVerificationsQueryDto extends AdminPaginationQueryDto {
  @ApiPropertyOptional({
    enum: ['pending', 'verified', 'rejected', 'awaiting', 'all'],
    default: 'awaiting',
  })
  @IsOptional()
  @IsIn(['pending', 'verified', 'rejected', 'awaiting', 'all'])
  status?: AdminVerificationFilter;
}
