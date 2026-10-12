import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Permission } from '../../common/constants/permissions.constants';
import { PlatformOnly } from '../../common/decorators/account-scope.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthCookieService } from '../auth/auth-cookie.service';
import { PlatformService } from './platform.service';

@ApiTags('Platform')
@Controller('platform')
@PlatformOnly()
@RequirePermissions(Permission.PLATFORM_MANAGE)
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly cookies: AuthCookieService,
  ) {}

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
