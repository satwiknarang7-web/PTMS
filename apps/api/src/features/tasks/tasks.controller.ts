import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  AddDependencyDto,
  CreateTaskDto,
  GanttQueryDto,
  MoveTaskDto,
  TaskQueryDto,
  UpdateTaskDto,
} from './dto/task.dto';
import { TasksService } from './tasks.service';
import { ViewerAllowed } from '../../common/decorators/viewer-allowed.decorator';

@ApiTags('Tasks')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @ViewerAllowed()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: TaskQueryDto) {
    return this.tasks.findAll(user, query);
  }

  @Get('gantt')
  @ViewerAllowed()
  gantt(@CurrentUser() user: AuthenticatedUser, @Query() query: GanttQueryDto) {
    return this.tasks.gantt(user, query.projectId);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTaskDto) {
    return this.tasks.create(user, dto);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tasks.findOne(user, id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasks.update(user, id, dto);
  }

  @Patch(':id/move')
  move(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: MoveTaskDto) {
    return this.tasks.move(user, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tasks.remove(user, id);
  }

  @Post(':id/dependencies')
  addDependency(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: AddDependencyDto) {
    return this.tasks.addDependency(user, id, dto);
  }

  @Delete(':id/dependencies/:dependencyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeDependency(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('dependencyId') dependencyId: string,
  ) {
    return this.tasks.removeDependency(user, id, dependencyId);
  }
}
