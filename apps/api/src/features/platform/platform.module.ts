import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { PlatformAdminsController } from './platform-admins.controller';
import { PlatformAdminsService } from './platform-admins.service';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [PlatformController, PlatformAdminsController],
  providers: [PlatformService, PlatformAdminsService],
})
export class PlatformModule {}
