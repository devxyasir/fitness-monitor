import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';
import type { SessionStatus } from '@replaycoach/types';

export class AdminSessionListQueryDto {
  @IsOptional()
  @IsEnum(['scheduled', 'live', 'ended', 'processed', 'archived'])
  status?: SessionStatus;

  @IsOptional()
  @IsString()
  orgId?: string;

  @IsOptional()
  @IsString()
  coachId?: string;

  @IsOptional()
  @IsISO8601()
  since?: string;

  @IsOptional()
  @IsISO8601()
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
