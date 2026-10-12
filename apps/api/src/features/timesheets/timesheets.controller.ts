import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  CreateTimeEntryDto,
  ReviewTimeEntryDto,
  TimeEntryQueryDto,
  TimeSummaryQueryDto,
  UpdateTimeEntryDto,
} from './dto/time-entry.dto';
import { TimesheetsService } from './timesheets.service';

@ApiTags('Timesheets')
@Controller('time-entries')
export class TimesheetsController {
  constructor(private readonly timesheets: TimesheetsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: TimeEntryQueryDto) {
    return this.timesheets.findAll(user, query);
  }

  @Get('people')
  people(@CurrentUser() user: AuthenticatedUser, @Query('projectId') projectId?: string) {
    return this.timesheets.people(user, projectId || undefined);
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthenticatedUser, @Query() query: TimeSummaryQueryDto) {
    return this.timesheets.summary(user, query);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTimeEntryDto) {
    return this.timesheets.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateTimeEntryDto) {
    return this.timesheets.update(user, id, dto);
  }

  @Post(':id/review')
  @HttpCode(HttpStatus.OK)
  review(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: ReviewTimeEntryDto) {
    return this.timesheets.review(user, id, dto.status);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.timesheets.remove(user, id);
  }
}
