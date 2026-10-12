import { Module } from '@nestjs/common';
import { PasswordService } from './password.service';
import { RoleUpgradeService } from './role-upgrade.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, PasswordService, RoleUpgradeService],
  exports: [UsersService, PasswordService],
})
export class UsersModule {}
