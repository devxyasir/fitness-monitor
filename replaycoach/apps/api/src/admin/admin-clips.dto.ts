import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';

export class AdminClipListQueryDto {
  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  orgId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  hidden?: boolean;

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
