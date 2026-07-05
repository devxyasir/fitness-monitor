import { IsEmail, IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name!: string;
}

export class InviteToOrgDto {
  @IsEmail()
  email!: string;

  @IsEnum(['coach', 'student'])
  role!: 'coach' | 'student';
}
