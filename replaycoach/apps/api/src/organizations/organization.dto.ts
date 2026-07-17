import { IsEmail, IsEnum, IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { IsAllowedEmailProvider } from '../common/validators/allowed-email-provider.validator';

export class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;
}

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  branding?: Record<string, unknown>;
}

export class InviteToOrgDto {
  @IsEmail()
  @IsAllowedEmailProvider()
  email!: string;

  @IsEnum(['coach', 'student'])
  role!: 'coach' | 'student';

  @IsOptional()
  @IsUUID()
  teamId?: string | null;
}
