import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { CreateMeetingDto, MeetingQueryDto, UpdateMeetingDto } from './dto/meeting.dto';
import { MeetingsService } from './meetings.service';
import { ViewerAllowed } from '../../common/decorators/viewer-allowed.decorator';

@ApiTags('Meetings')
@ViewerAllowed()
@Controller('meetings')
/** Coordinators and root manage meetings; clients schedule client meetings on their projects (see MeetingsService). */
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: MeetingQueryDto) {
    return this.meetings.findAll(user, query);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.meetings.findOne(user, id);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateMeetingDto) {
    return this.meetings.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateMeetingDto) {
    return this.meetings.update(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.meetings.remove(user, id);
  }
}
