import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { CreateSessionDto as ICreateSessionDto, UpdateSessionDto as IUpdateSessionDto, SessionAccessType } from '@replaycoach/types';

export class CreateSessionDto implements ICreateSessionDto {
  @IsDateString()
  scheduledAt!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  retentionDays?: number;

  @IsOptional()
  @IsBoolean()
  isInstant?: boolean;

  @IsOptional()
  @IsIn(['public', 'lobby'])
  accessType?: SessionAccessType;
}

export class UpdateSessionDto implements IUpdateSessionDto {
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  retentionDays?: number;

  @IsOptional()
  @IsIn(['public', 'lobby'])
  accessType?: SessionAccessType;
}
