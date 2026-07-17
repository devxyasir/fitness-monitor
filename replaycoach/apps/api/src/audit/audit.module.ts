import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuditLog } from '../database/entities/others.entities';
import { AuditService } from './audit.service';

/** Leaf module (no imports beyond TypeORM) — safe for any domain module to
 * import without circular-dependency risk. See audit.service.ts. */
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
