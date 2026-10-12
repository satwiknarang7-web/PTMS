import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePlatformSettingsDto {
  @ApiPropertyOptional({ description: 'Everyone must use an authenticator app to sign in' })
  @IsOptional()
  @IsBoolean()
  twoFactorRequired?: boolean;
}
