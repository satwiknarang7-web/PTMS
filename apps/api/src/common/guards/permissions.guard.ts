import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { hasPermission, Permission } from '../constants/permissions.constants';
import { isViewer } from '../constants/roles.constants';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { VIEWER_ALLOWED_KEY } from '../decorators/viewer-allowed.decorator';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const { user: principal } = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    if (
      principal &&
      isViewer(principal.role) &&
      !this.reflector.getAllAndOverride<boolean>(VIEWER_ALLOWED_KEY, targets) &&
      !this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)
    ) {
      throw new ForbiddenException('Client accounts can only open project dashboards and client meetings');
    }

    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    if (!user || !required.every((permission) => hasPermission(user.role, permission))) {
      throw new ForbiddenException('You do not have permission to perform this action');
    }
    return true;
  }
}
