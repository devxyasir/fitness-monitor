import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export class UpdateSmtpDto {
  @IsOptional()
  @IsString()
  host?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsBoolean()
  secure?: boolean;

  @IsOptional()
  @IsString()
  user?: string;

  @IsOptional()
  @IsString()
  from?: string;

  /** Omit entirely to keep the existing password. */
  @IsOptional()
  @IsString()
  password?: string;
}

class ThemeColorSetDto {
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR, { message: 'brand must be a hex color like #B14A28' })
  brand?: string;

  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR, { message: 'session must be a hex color like #1F6F6B' })
  session?: string;

  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR, { message: 'analytics must be a hex color like #8A6222' })
  analytics?: string;
}

export class UpdateThemeDto {
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ThemeColorSetDto)
  light?: ThemeColorSetDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ThemeColorSetDto)
  dark?: ThemeColorSetDto;
}

class InviteEmailTemplateDto {
  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  heading?: string;

  @IsOptional()
  @IsString()
  bodyIntro?: string;
}

export class UpdateEmailTemplatesDto {
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => InviteEmailTemplateDto)
  invite?: InviteEmailTemplateDto;
}
