import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import type { Request } from 'express';
import { Permission } from '../../common/constants/permissions.constants';
import { PlatformOnly } from '../../common/decorators/account-scope.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PlatformUser } from '../../common/interfaces/authenticated-user.interface';
import { requestOrigin } from '../../common/utils/request.util';
import { InitialCoordinatorDto } from '../organizations/dto/platform-organization.dto';
import { PlatformAdminsService } from './platform-admins.service';

class UpdatePlatformAdminDto {
  @ApiProperty()
  @IsBoolean()
  isActive: boolean;
}

const inviter = (user: PlatformUser, req: Request) => ({ name: `${user.firstName} ${user.lastName}`, origin: requestOrigin(req) });

@ApiTags('Platform · Root admins')
@Controller('platform/admins')
@PlatformOnly()
@RequirePermissions(Permission.PLATFORM_MANAGE)
export class PlatformAdminsController {
  constructor(private readonly admins: PlatformAdminsService) {}

  @Get()
  findAll() {
    return this.admins.findAll();
  }

  @Post()
  create(@Body() dto: InitialCoordinatorDto, @CurrentUser() user: PlatformUser, @Req() req: Request) {
    return this.admins.create(dto, inviter(user, req));
  }

  @Post(':id/invite')
  @HttpCode(HttpStatus.NO_CONTENT)
  resendInvite(@Param('id') id: string, @CurrentUser() user: PlatformUser, @Req() req: Request) {
    return this.admins.resendInvite(id, inviter(user, req));
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePlatformAdminDto, @CurrentUser() user: PlatformUser) {
    return this.admins.setActive(user.id, id, dto.isActive);
  }
}
