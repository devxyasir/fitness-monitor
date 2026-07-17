import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { UserRole } from '@replaycoach/types';

/**
 * Password rule: min 8 chars, at least one uppercase, one lowercase, one digit.
 * (see 16_Security_Guidelines.md §1)
 */
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(PASSWORD_REGEX, {
    message: 'Password must be at least 8 chars with uppercase, lowercase, and a digit',
  })
  password!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(255)
  displayName!: string;

  @IsEnum(['coach', 'student'])
  role!: Extract<UserRole, 'coach' | 'student'>;

  /** Redeems an org (and optionally team) invite as part of registration —
   * on success this overrides `role` with whatever the invite specifies. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  inviteToken?: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  /** Persistent login: long-lived refresh cookie that survives browser close.
   * Omitted/false → session cookie tied to the short session TTL. */
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;

  /** Set by the dedicated /admin/login page — see AuthService.login. */
  @IsOptional()
  @IsIn(['admin'])
  context?: 'admin';
}

/** POST /auth/admin/elevate — re-verifies an already-logged-in
 * platform_admin's password to refresh a stale `adminAuthAt` claim. */
export class AdminElevateDto {
  @IsString()
  @MinLength(1)
  password!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(PASSWORD_REGEX, {
    message: 'Password must be at least 8 chars with uppercase, lowercase, and a digit',
  })
  newPassword!: string;
}
