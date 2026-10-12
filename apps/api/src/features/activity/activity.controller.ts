import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { ActivityService } from './activity.service';
import { ActivityQueryDto } from './dto/activity-query.dto';
import { ViewerAllowed } from '../../common/decorators/viewer-allowed.decorator';

@ApiTags('Activity')
@Controller('activities')
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  @ViewerAllowed()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ActivityQueryDto) {
    return this.activity.findAll(user, query);
  }
}
