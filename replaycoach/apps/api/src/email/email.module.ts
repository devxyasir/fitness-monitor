import { Module } from '@nestjs/common';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { EmailService } from './email.service';

@Module({
  imports: [SystemSettingsModule],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
