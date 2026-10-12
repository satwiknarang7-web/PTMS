import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TrimString } from '../../../common/transformers/query.transformers';

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

export class ChallengeDto {
  @ApiProperty({ description: 'Returned by the password step of sign-in' })
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  challenge: string;
}

export class TwoFactorCodeDto extends ChallengeDto {
  @ApiPropertyOptional({ description: '6-digit code from the authenticator app' })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  code?: string;

  @ApiPropertyOptional({ description: 'One-time recovery code, instead of `code`' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  recoveryCode?: string;
}

export class AuthenticatorCodeDto {
  @ApiProperty({ description: '6-digit code from the authenticator app' })
  @IsString()
  @MaxLength(12)
  code: string;
}
