import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { UserRole } from '@replaycoach/types';

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
