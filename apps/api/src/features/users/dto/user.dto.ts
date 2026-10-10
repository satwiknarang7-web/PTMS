import { ApiProperty, ApiPropertyOptional, OmitType, PartialType, PickType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { ORG_ROLES, OrgRole } from '../../../common/constants/roles.constants';
import { NullableString, ToBoolean, TrimString } from '../../../common/transformers/query.transformers';
import { IsPassword } from '../../../common/validation/password.policy';

export class UserQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ORG_ROLES })
  @IsOptional()
  @IsIn(ORG_ROLES)
  role?: OrgRole;

  @ApiPropertyOptional()
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateUserDto {
  @ApiProperty()
  @TrimString()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty()
  @TrimString()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  firstName: string;

  @ApiProperty()
  @TrimString()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  lastName: string;

  @ApiPropertyOptional({ description: 'Initial password; leave out to email an invitation link instead' })
  @IsOptional()
  @IsPassword()
  password?: string;

  @ApiProperty({ enum: ORG_ROLES })
  @IsIn(ORG_ROLES)
  role: OrgRole;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @NullableString()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(100)
  jobTitle?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hourlyRate?: number | null;
}

export class UpdateUserDto extends PartialType(OmitType(CreateUserDto, ['email', 'password'] as const)) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateProfileDto extends PartialType(PickType(CreateUserDto, ['firstName', 'lastName', 'jobTitle'] as const)) {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @NullableString()
  @ValidateIf((_, value) => value !== null)
  @IsUrl({ require_tld: false })
  avatarUrl?: string | null;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  currentPassword: string;

  @ApiProperty()
  @IsPassword()
  newPassword: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsPassword()
  password: string;
}
