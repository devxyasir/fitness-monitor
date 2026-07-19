import { Module } from '@nestjs/common';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { EmailLogModule } from './email-log.module';
import { EmailService } from './email.service';

@Module({
  imports: [SystemSettingsModule, EmailLogModule],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
