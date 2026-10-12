import { Body, Controller, Delete, ForbiddenException, Get, Header, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { hasPermission, Permission } from '../../common/constants/permissions.constants';
import { isRoot } from '../../common/constants/roles.constants';
import { AccountScope, ForAccounts } from '../../common/decorators/account-scope.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthenticatedUser, Principal } from '../../common/interfaces/authenticated-user.interface';
import {
  ChangePasswordDto,
  CreateUserDto,
  RemoveUserQueryDto,
  ResetPasswordDto,
  UpdateProfileDto,
  UpdateUserDto,
  UserQueryDto,
} from './dto/user.dto';
import { UsersService } from './users.service';
import { StrictThrottle } from '../../common/rate-limit/strict-throttle.decorator';
import { ViewerAllowed } from '../../common/decorators/viewer-allowed.decorator';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions(Permission.USERS_VIEW)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: UserQueryDto) {
    return this.users.findAll(user.organizationId, query, hasPermission(user.role, Permission.USERS_MANAGE));
  }

  @Patch('me')
  @ViewerAllowed()
  @ForAccounts(AccountScope.ANY)
  updateProfile(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.users.updateProfile(userId, dto);
  }

  /** Uploads a profile photo (raw image bytes, e.g. Content-Type: image/jpeg). */
  @Post('me/photo')
  @ViewerAllowed()
  @ForAccounts(AccountScope.ANY)
  setPhoto(@CurrentUser('id') userId: string, @Req() req: Request) {
    return this.users.setPhoto(userId, req.body as Buffer | undefined);
  }

  @Delete('me/photo')
  @ViewerAllowed()
  @ForAccounts(AccountScope.ANY)
  removePhoto(@CurrentUser('id') userId: string) {
    return this.users.removePhoto(userId);
  }

  @Get(':id/photo')
  @ViewerAllowed()
  @ForAccounts(AccountScope.ANY)
  @Header('Cache-Control', 'private, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  async photo(@CurrentUser() viewer: Principal, @Param('id') id: string, @Res() res: Response) {
    const photo = await this.users.photo(viewer, id);
    res.type(photo.mimeType).setHeader('Content-Disposition', 'inline');
    res.send(Buffer.from(photo.data));
  }

  @Post('me/password')
  @StrictThrottle()
  @ViewerAllowed()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ForAccounts(AccountScope.ANY)
  changePassword(@CurrentUser('id') userId: string, @Body() dto: ChangePasswordDto) {
    return this.users.changePassword(userId, dto);
  }

  @Get(':id')
  @RequirePermissions(Permission.USERS_VIEW)
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return hasPermission(user.role, Permission.USERS_MANAGE)
      ? this.users.findOne(user.organizationId, id)
      : this.users.findDirectoryEntry(user.organizationId, id);
  }

  /** Projects, open work, time and activity of one person (coordinators and root). */
  @Get(':id/details')
  @RequirePermissions(Permission.USERS_MANAGE)
  details(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.users.details(user.organizationId, id);
  }

  @Post()
  @RequirePermissions(Permission.USERS_MANAGE)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateUserDto) {
    return this.users.create(user, dto);
  }


  @Patch(':id')
  @RequirePermissions(Permission.USERS_MANAGE)
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(user, id, dto);
  }

  /** Root admins only: permanently removes a person (see UsersService.remove). */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.USERS_MANAGE)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Query() query: RemoveUserQueryDto) {
    if (!isRoot(user.role)) throw new ForbiddenException('Only a root admin can remove people. Deactivate the account instead.');
    return this.users.remove(user.organizationId, user.id, id, query.transferTo);
  }

  @Post(':id/reset-two-factor')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.USERS_MANAGE)
  resetTwoFactor(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.users.resetTwoFactor(user, id);
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.USERS_MANAGE)
  resetPassword(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.users.resetPassword(user, id, dto.password);
  }
}
