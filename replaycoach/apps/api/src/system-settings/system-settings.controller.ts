import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';

import type {
  EmailTemplateSettings,
  GeoAccessSettings,
  JwtPayload,
  PlatformSettings,
  SmtpSettings,
  SystemSettingsDto,
  SystemStatusDto,
  ThemeSettings,
} from '@replaycoach/types';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminElevatedGuard } from '../common/guards/admin-elevated.guard';
import { SystemSettingsService } from './system-settings.service';
import { UpdateEmailTemplatesDto, UpdatePlatformDto, UpdateSmtpDto, UpdateThemeDto } from './system-settings.dto';
import { UpdateGeoAccessSettingsDto } from '../geo/geo.dto';

/** Platform-wide config, editable only by platform_admin — the deployment
 * operator, not a per-org studio_admin (branding for an individual org's
 * own look-and-feel is a separate, already-existing concept:
 * Organization.branding via PATCH /organizations/:id). */
// Deliberately no class-level @Roles() — RolesGuard falls back to
// class-level metadata via getAllAndOverride() when a method has none, so a
// class-level @Roles('platform_admin') would still gate the @Public() theme
// route below (JwtAuthGuard skips auth for it, but RolesGuard would then
// see no request.user and 403). Each protected route names its own role.
@Controller('system-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SystemSettingsController {
  constructor(private readonly settingsService: SystemSettingsService) {}

  /** Public — every visitor's browser needs the brand colors to render the
   * site (including logged-out marketing pages), not just admins. Colors
   * only — SMTP/email-template content stays behind the admin-only GET. */
  @Public()
  @Get('theme')
  async getPublicTheme(): Promise<ThemeSettings> {
    return this.settingsService.getTheme();
  }

  /** Public — the root layout checks this before rendering anything, to
   * show a maintenance page to non-admin visitors and to decide whether
   * GeoAccessGate needs to prompt for GPS permission. Deliberately minimal
   * — never the allowed-countries list or anything else sensitive, just
   * enough for a client-side gate to decide its next move. */
  @Public()
  @Get('status')
  async getPublicStatus(): Promise<SystemStatusDto> {
    const [platform, geoAccess] = await Promise.all([
      this.settingsService.getPlatform(),
      this.settingsService.getGeoAccess(),
    ]);
    return {
      maintenanceMode: platform.maintenanceMode,
      geoEnabled: geoAccess.enabled,
      geoDetectionMethod: geoAccess.detectionMethod,
      geoFallbackToIp: geoAccess.fallbackToIp,
      geoStrictMode: geoAccess.strictMode,
    };
  }

  /** AdminElevatedGuard added here (and on every mutation below) to match
   * the same fresh-re-auth requirement the admin dashboard/sessions/
   * geo-logs pages already enforce — previously inconsistent, Settings
   * stayed accessible indefinitely after elevation lapsed. */
  @Get()
  @Roles('platform_admin')
  @UseGuards(AdminElevatedGuard)
  async getAll(): Promise<SystemSettingsDto> {
    return this.settingsService.getAll();
  }

  @Patch('smtp')
  @Roles('platform_admin')
  @UseGuards(AdminElevatedGuard)
  async updateSmtp(@Body() dto: UpdateSmtpDto, @CurrentUser() user: JwtPayload): Promise<SmtpSettings> {
    return this.settingsService.updateSmtp(dto, user.sub);
  }

  @Patch('theme')
  @Roles('platform_admin')
  @UseGuards(AdminElevatedGuard)
  async updateTheme(@Body() dto: UpdateThemeDto, @CurrentUser() user: JwtPayload): Promise<ThemeSettings> {
    return this.settingsService.updateTheme(dto, user.sub);
  }

  @Patch('email-templates')
  @Roles('platform_admin')
  @UseGuards(AdminElevatedGuard)
  async updateEmailTemplates(
    @Body() dto: UpdateEmailTemplatesDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<EmailTemplateSettings> {
    return this.settingsService.updateEmailTemplates(dto, user.sub);
  }

  @Patch('platform')
  @Roles('platform_admin')
  @UseGuards(AdminElevatedGuard)
  async updatePlatform(@Body() dto: UpdatePlatformDto, @CurrentUser() user: JwtPayload): Promise<PlatformSettings> {
    return this.settingsService.updatePlatform(dto, user.sub);
  }

  @Patch('geo-access')
  @Roles('platform_admin')
  @UseGuards(AdminElevatedGuard)
  async updateGeoAccess(
    @Body() dto: UpdateGeoAccessSettingsDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<GeoAccessSettings> {
    return this.settingsService.updateGeoAccess(dto, user.sub);
  }
}
