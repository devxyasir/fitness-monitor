import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';

export class EmailLogListQueryDto {
  @IsOptional()
  @IsIn(['invite', 'org_message'])
  kind?: 'invite' | 'org_message';

  @IsOptional()
  @IsIn(['success', 'failure'])
  status?: 'success' | 'failure';

  @IsOptional()
  @IsString()
  orgId?: string;

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
