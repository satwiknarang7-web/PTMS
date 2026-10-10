import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Res } from '@nestjs/common';
import { ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsOptional } from 'class-validator';
import type { Response } from 'express';
import { Permission } from '../../common/constants/permissions.constants';
import { PlatformOnly } from '../../common/decorators/account-scope.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlatformUser } from '../../common/interfaces/authenticated-user.interface';
import { AuthCookieService } from '../auth/auth-cookie.service';
import { MailService } from '../mail/mail.service';
import { PlatformService } from './platform.service';

class TestEmailDto {
  @ApiPropertyOptional({ description: 'Defaults to the signed-in root admin' })
  @IsOptional()
  @IsEmail()
  to?: string;
}

@ApiTags('Platform')
@Controller('platform')
@PlatformOnly()
@RequirePermissions(Permission.PLATFORM_MANAGE)
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly cookies: AuthCookieService,
    private readonly mail: MailService,
  ) {}

  /** Email (SMTP) settings without the password, to check the configuration. */
  @Get('mail')
  mailSettings() {
    return this.mail.settings();
  }

  /** Sends a test email; a failure explains which SMTP setting to fix. */
  @Post('mail/test')
  @HttpCode(HttpStatus.NO_CONTENT)
  sendTestEmail(@Body() dto: TestEmailDto, @CurrentUser() user: PlatformUser) {
    return this.mail.sendTest(dto.to ?? user.email);
  }

  @Get('overview')
  overview() {
    return this.platform.overview();
  }

  /** Opens an organization's workspace: root then acts there with super admin authority. */
  @Post('workspace/:organizationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async enterWorkspace(@Param('organizationId') organizationId: string, @Res({ passthrough: true }) res: Response) {
    await this.platform.assertOrganization(organizationId);
    this.cookies.setWorkspace(res, organizationId);
  }

  /** Leaves the open workspace and returns to the platform console. */
  @Delete('workspace')
  @HttpCode(HttpStatus.NO_CONTENT)
  exitWorkspace(@Res({ passthrough: true }) res: Response) {
    this.cookies.clearWorkspace(res);
  }
}
