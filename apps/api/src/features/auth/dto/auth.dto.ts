import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TrimString } from '../../../common/transformers/query.transformers';
import { IsPassword } from '../../../common/validation/password.policy';

export class LoginDto {
  @ApiProperty()
  @TrimString()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;

  @ApiPropertyOptional({ description: 'Keep me signed in (longer, persistent session)' })
  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @TrimString()
  @IsEmail()
  email: string;
}

export class TokenDto {
  @ApiProperty({ description: 'Token from an invitation or password reset email' })
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token: string;
}

export class SetPasswordDto extends TokenDto {
  @ApiProperty()
  @IsPassword()
  password: string;
}
