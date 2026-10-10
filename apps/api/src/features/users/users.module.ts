import { Module } from '@nestjs/common';
import { AccountLinksService } from './account-links.service';
import { PasswordService } from './password.service';
import { RoleUpgradeService } from './role-upgrade.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, PasswordService, RoleUpgradeService, AccountLinksService],
  exports: [UsersService, PasswordService, AccountLinksService],
})
export class UsersModule {}
