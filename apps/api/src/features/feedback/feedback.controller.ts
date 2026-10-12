import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permission } from '../../common/constants/permissions.constants';
import { AccountScope, ForAccounts, PlatformOnly } from '../../common/decorators/account-scope.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { ViewerAllowed } from '../../common/decorators/viewer-allowed.decorator';
import { Principal } from '../../common/interfaces/authenticated-user.interface';
import { CreateFeedbackDto, UpdateFeedbackDto } from './feedback.dto';
import { FeedbackService } from './feedback.service';

/** Anyone signed in (clients included) can send feedback about the app. */
@ApiTags('Feedback')
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ViewerAllowed()
  @ForAccounts(AccountScope.ANY)
  create(@CurrentUser() user: Principal, @Body() dto: CreateFeedbackDto) {
    return this.feedback.create(user, dto);
  }
}

/** Reading feedback is for root admins only. */
@ApiTags('Platform · Feedback')
@Controller('platform/feedback')
@PlatformOnly()
@RequirePermissions(Permission.PLATFORM_MANAGE)
export class PlatformFeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get()
  findAll() {
    return this.feedback.findAll();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateFeedbackDto) {
    return this.feedback.setResolved(id, dto.resolved);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.feedback.remove(id);
  }
}
