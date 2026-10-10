import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlatformUser } from '../../common/interfaces/authenticated-user.interface';
import { requestOrigin } from '../../common/utils/request.util';
import { Permission } from '../../common/constants/permissions.constants';
import { PlatformOnly } from '../../common/decorators/account-scope.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  CreatePlatformOrganizationDto,
  InitialCoordinatorDto,
  PlatformOrganizationQueryDto,
  UpdatePlatformOrganizationDto,
} from './dto/platform-organization.dto';
import { Inviter, PlatformOrganizationsService } from './platform-organizations.service';

const inviter = (user: PlatformUser, req: Request): Inviter => ({ name: `${user.firstName} ${user.lastName}`, origin: requestOrigin(req) });

@ApiTags('Platform · Organizations')
@Controller('platform/organizations')
@PlatformOnly()
@RequirePermissions(Permission.PLATFORM_MANAGE)
export class PlatformOrganizationsController {
  constructor(private readonly organizations: PlatformOrganizationsService) {}

  @Get()
  findAll(@Query() query: PlatformOrganizationQueryDto) {
    return this.organizations.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.organizations.findOne(id);
  }

  @Post()
  create(@Body() dto: CreatePlatformOrganizationDto, @CurrentUser() user: PlatformUser, @Req() req: Request) {
    return this.organizations.create(dto, inviter(user, req));
  }

  @Post(':id/coordinators')
  addCoordinator(@Param('id') id: string, @Body() dto: InitialCoordinatorDto, @CurrentUser() user: PlatformUser, @Req() req: Request) {
    return this.organizations.addCoordinator(id, dto, inviter(user, req));
  }

  @Post(':id/coordinators/:userId/invite')
  @HttpCode(HttpStatus.NO_CONTENT)
  resendCoordinatorInvite(@Param('id') id: string, @Param('userId') userId: string, @CurrentUser() user: PlatformUser, @Req() req: Request) {
    return this.organizations.resendCoordinatorInvite(id, userId, inviter(user, req));
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePlatformOrganizationDto) {
    return this.organizations.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.organizations.remove(id);
  }
}
