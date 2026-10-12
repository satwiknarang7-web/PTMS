import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { Permission } from '../../common/constants/permissions.constants';
import { PlatformOnly } from '../../common/decorators/account-scope.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PlatformUser } from '../../common/interfaces/authenticated-user.interface';
import { InitialCoordinatorDto } from '../organizations/dto/platform-organization.dto';
import { ResetPasswordDto } from '../users/dto/user.dto';
import { PlatformAdminsService } from './platform-admins.service';

class UpdatePlatformAdminDto {
  @ApiProperty()
  @IsBoolean()
  isActive: boolean;
}

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
  create(@Body() dto: InitialCoordinatorDto) {
    return this.admins.create(dto);
  }

  @Post(':id/reset-two-factor')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetTwoFactor(@Param('id') id: string, @CurrentUser() user: PlatformUser) {
    return this.admins.resetTwoFactor(user.id, id);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto, @CurrentUser() user: PlatformUser) {
    return this.admins.resetPassword(user.id, id, dto.password);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePlatformAdminDto, @CurrentUser() user: PlatformUser) {
    return this.admins.setActive(user.id, id, dto.isActive);
  }
}
