import { ArrayMaxSize, ArrayMinSize, ArrayNotEmpty, IsArray, IsEmail, IsEnum, IsObject, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
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

export class UpdateOrgStatusDto {
  @IsEnum(['active', 'suspended'])
  status!: 'active' | 'suspended';
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

export class SendOrgMessageDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  recipientIds!: string[];

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  message!: string;
}
