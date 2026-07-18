import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { GeoDetectionMethod } from '@replaycoach/types';

export class GeoCheckDto {
  @IsOptional()
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @IsLongitude()
  lon?: number;
}

export class GeoAllowedRegionDto {
  @IsString()
  @Matches(/^[A-Z]{2}$/, { message: 'countryCode must be a 2-letter ISO 3166-1 alpha-2 code' })
  countryCode!: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(200)
  regionNames!: string[];
}

export class UpdateGeoAccessSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(['global', 'restricted'])
  mode?: 'global' | 'restricted';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Matches(/^[A-Z]{2}$/, { each: true, message: 'allowedCountries must contain 2-letter ISO codes' })
  @ArrayMaxSize(250)
  allowedCountries?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GeoAllowedRegionDto)
  @ArrayMaxSize(250)
  allowedRegions?: GeoAllowedRegionDto[];

  @IsOptional()
  @IsEnum(['ip', 'gps'])
  detectionMethod?: GeoDetectionMethod;

  @IsOptional()
  @IsBoolean()
  requireGpsPermission?: boolean;

  @IsOptional()
  @IsBoolean()
  fallbackToIp?: boolean;

  @IsOptional()
  @IsBoolean()
  strictMode?: boolean;

  @IsOptional()
  @IsBoolean()
  blockUnknownLocations?: boolean;
}

export class GeoAccessLogListQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{2}$/)
  countryCode?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allowed?: boolean;

  @IsOptional()
  @IsEnum(['ip', 'gps'])
  detectionMethod?: GeoDetectionMethod;

  @IsOptional()
  @IsString()
  since?: string;

  @IsOptional()
  @IsString()
  until?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
