import { Module } from '@nestjs/common';
import { AccountAuditService } from './account-audit.service';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { MeTrustService } from './me-trust.service';

@Module({
  controllers: [MeController],
  providers: [MeService, AccountAuditService, MeTrustService],
  // Phase 6 — `AccountAuditService` is now consumed by ProfessionalModule
  // and ConsultationsModule for booking-lifecycle audit trails. The
  // `MeService` re-export is preserved for existing consumers.
  exports: [MeService, AccountAuditService],
})
export class MeModule {}
