import { Type } from 'class-transformer';
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { UserRole, UserStatus } from '@replaycoach/types';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  displayName!: string;

  @IsEnum(['coach', 'student'])
  role!: Extract<UserRole, 'coach' | 'student'>;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  avatarUrl?: string;
}

export class UpdateUserStatusDto {
  @IsEnum(['active', 'pending', 'suspended', 'disabled'])
  status!: UserStatus;
}

export class ListUsersQueryDto {
  @IsOptional()
  @IsString()
  orgId?: string;

  @IsOptional()
  @IsEnum(['platform_admin', 'studio_admin', 'coach', 'student'])
  role?: UserRole;

  @IsOptional()
  @IsEnum(['active', 'pending', 'suspended', 'disabled'])
  status?: UserStatus;

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
