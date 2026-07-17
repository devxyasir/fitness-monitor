import { Type } from 'class-transformer';
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { UserRole, UserStatus } from '@replaycoach/types';

// Mirrors apps/api/src/auth/auth.dto.ts's PASSWORD_REGEX exactly.
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

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

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(PASSWORD_REGEX, {
    message: 'Password must be at least 8 chars with uppercase, lowercase, and a digit',
  })
  newPassword!: string;
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
