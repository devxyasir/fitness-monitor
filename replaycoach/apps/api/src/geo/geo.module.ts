import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GeoAccessLog } from './geo-access-log.entity';
import { GeoController } from './geo.controller';
import { AdminGeoController } from './admin-geo.controller';
import { GeoLookupService } from './geo-lookup.service';
import { GeoAccessService } from './geo-access.service';
import { GeoCheckService } from './geo-check.service';
import { GeoLogsService } from './geo-logs.service';
import { GeoStatsService } from './geo-stats.service';
import { GeoAccessGuard } from './geo-access.guard';
import { IpApiProvider } from './providers/ip-api.provider';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

@Module({
  imports: [TypeOrmModule.forFeature([GeoAccessLog]), SystemSettingsModule],
  providers: [IpApiProvider, GeoLookupService, GeoAccessService, GeoCheckService, GeoLogsService, GeoStatsService, GeoAccessGuard],
  controllers: [GeoController, AdminGeoController],
  // GeoAccessGuard is exported so AuthModule can apply it directly to
  // register()/login() — the two endpoints the spec calls out by name.
  exports: [GeoAccessGuard, GeoCheckService],
})
export class GeoModule {}
