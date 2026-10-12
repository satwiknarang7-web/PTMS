import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permission } from '../../common/constants/permissions.constants';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  CreateLookupDto,
  DeleteLookupQueryDto,
  LookupQueryDto,
  ReorderLookupsDto,
  UpdateLookupDto,
} from './dto/lookup.dto';
import { LookupsService } from './lookups.service';
import { ViewerAllowed } from '../../common/decorators/viewer-allowed.decorator';

@ApiTags('Lookups')
@Controller('lookups')
export class LookupsController {
  constructor(private readonly lookups: LookupsService) {}

  @Get()
  @ViewerAllowed()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: LookupQueryDto) {
    return this.lookups.findAll(user.organizationId, query.type);
  }

  @Post()
  @RequirePermissions(Permission.LOOKUPS_MANAGE)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLookupDto) {
    return this.lookups.create(user.organizationId, dto);
  }

  @Patch('reorder')
  @RequirePermissions(Permission.LOOKUPS_MANAGE)
  reorder(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReorderLookupsDto) {
    return this.lookups.reorder(user.organizationId, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.LOOKUPS_MANAGE)
  update(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body() dto: UpdateLookupDto) {
    return this.lookups.update(user.organizationId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.LOOKUPS_MANAGE)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Query() query: DeleteLookupQueryDto) {
    return this.lookups.remove(user.organizationId, id, query.replacementId);
  }
}
