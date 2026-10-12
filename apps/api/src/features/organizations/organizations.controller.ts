import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Permission } from '../../common/constants/permissions.constants';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationsService } from './organizations.service';
import { ViewerAllowed } from '../../common/decorators/viewer-allowed.decorator';

@ApiTags('Organization')
@Controller('organization')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  @ViewerAllowed()
  current(@CurrentUser() user: AuthenticatedUser) {
    return this.organizations.findById(user.organizationId);
  }

  @Patch()
  @RequirePermissions(Permission.ORG_MANAGE)
  update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateOrganizationDto) {
    return this.organizations.update(user.organizationId, dto);
  }
}
