import { Module } from '@nestjs/common';
import { AccountAuditService } from './account-audit.service';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { MeTrustService } from './me-trust.service';

@Module({
  controllers: [MeController],
  providers: [MeService, AccountAuditService, MeTrustService],
  exports: [MeService],
})
export class MeModule {}
