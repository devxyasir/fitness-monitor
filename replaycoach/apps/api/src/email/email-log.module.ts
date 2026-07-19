import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EmailLog } from './email-log.entity';
import { EmailLogService } from './email-log.service';

/** Leaf module (no imports beyond TypeORM) — mirrors audit.module.ts.
 * Imported by EmailModule (the writer) and AdminModule (the reader,
 * AdminEmailLogController) independently, so neither side risks a circular
 * module dependency through the other. */
@Module({
  imports: [TypeOrmModule.forFeature([EmailLog])],
  providers: [EmailLogService],
  exports: [EmailLogService],
})
export class EmailLogModule {}
