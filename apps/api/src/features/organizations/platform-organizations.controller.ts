import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlatformUser } from '../../common/interfaces/authenticated-user.interface';
import { Permission } from '../../common/constants/permissions.constants';
import { PlatformOnly } from '../../common/decorators/account-scope.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import {
  ChangeRoleDto,
  CreatePlatformOrganizationDto,
  InitialCoordinatorDto,
  PlatformOrganizationQueryDto,
  UpdatePlatformOrganizationDto,
} from './dto/platform-organization.dto';
import { RemoveUserQueryDto, ResetPasswordDto } from '../users/dto/user.dto';
import { UsersService } from '../users/users.service';
import { PlatformOrganizationsService } from './platform-organizations.service';

@ApiTags('Platform · Organizations')
@Controller('platform/organizations')
@PlatformOnly()
@RequirePermissions(Permission.PLATFORM_MANAGE)
export class PlatformOrganizationsController {
  constructor(
    private readonly organizations: PlatformOrganizationsService,
    private readonly users: UsersService,
  ) {}

  @Get()
  findAll(@Query() query: PlatformOrganizationQueryDto) {
    return this.organizations.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.organizations.findOne(id);
  }

  @Post()
  create(@Body() dto: CreatePlatformOrganizationDto) {
    return this.organizations.create(dto);
  }

  @Post(':id/coordinators')
  addCoordinator(@Param('id') id: string, @Body() dto: InitialCoordinatorDto) {
    return this.organizations.addCoordinator(id, dto);
  }

  @Post(':id/users/:userId/reset-two-factor')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetTwoFactor(@Param('id') id: string, @Param('userId') userId: string) {
    return this.organizations.resetTwoFactor(id, userId);
  }

  @Post(':id/users/:userId/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(@Param('id') id: string, @Param('userId') userId: string, @Body() dto: ResetPasswordDto) {
    return this.organizations.resetPassword(id, userId, dto.password);
  }

  /** Permanently removes a person from the organization; their work goes to `transferTo` or a coordinator. */
  @Delete(':id/users/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeUser(@Param('id') id: string, @Param('userId') userId: string, @Query() query: RemoveUserQueryDto, @CurrentUser() user: PlatformUser) {
    return this.users.remove(id, user.id, userId, query.transferTo);
  }

  @Patch(':id/users/:userId/role')
  changeRole(@Param('id') id: string, @Param('userId') userId: string, @Body() dto: ChangeRoleDto) {
    return this.organizations.changeRole(id, userId, dto.role);
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
