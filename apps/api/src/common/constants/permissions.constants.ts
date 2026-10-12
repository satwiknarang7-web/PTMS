import { normalizeRole, OrgRole, PlatformRole } from './roles.constants';

/**
 * Capabilities granted by a user's role. Organization permissions apply inside the user's own
 * organization; project-level access is enforced separately by ProjectAccessService.
 */
export const Permission = {
  // Platform (root only)
  PLATFORM_MANAGE: 'platform:manage',
  /** Grant or revoke the project coordinator role. */
  COORDINATORS_MANAGE: 'coordinators:manage',
  // Organization
  ORG_MANAGE: 'org:manage',
  USERS_VIEW: 'users:view',
  /** Create and manage member accounts; open any member's details. */
  USERS_MANAGE: 'users:manage',
  LOOKUPS_MANAGE: 'lookups:manage',
  PROJECTS_CREATE: 'projects:create',
  PROJECTS_VIEW_ALL: 'projects:view-all',
  MEETINGS_MANAGE: 'meetings:manage',
  TIMESHEETS_APPROVE: 'timesheets:approve',
  TIMESHEETS_VIEW_ALL: 'timesheets:view-all',
  REPORTS_VIEW: 'reports:view',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

const COORDINATOR_PERMISSIONS: readonly Permission[] = [
  Permission.ORG_MANAGE,
  Permission.USERS_VIEW,
  Permission.USERS_MANAGE,
  Permission.LOOKUPS_MANAGE,
  Permission.PROJECTS_CREATE,
  Permission.PROJECTS_VIEW_ALL,
  Permission.MEETINGS_MANAGE,
  Permission.TIMESHEETS_APPROVE,
  Permission.TIMESHEETS_VIEW_ALL,
  Permission.REPORTS_VIEW,
];

export const ROLE_PERMISSIONS: Record<OrgRole | PlatformRole, readonly Permission[]> = {
  // Root manages the platform and has every coordinator permission in any organization it opens.
  [PlatformRole.ROOT]: [Permission.PLATFORM_MANAGE, Permission.COORDINATORS_MANAGE, ...COORDINATOR_PERMISSIONS],
  [OrgRole.PROJECT_COORDINATOR]: COORDINATOR_PERMISSIONS,
  [OrgRole.MEMBER]: [Permission.USERS_VIEW],
  // Clients reach only the routes marked @ViewerAllowed(); see PermissionsGuard.
  [OrgRole.VIEWER]: [],
};

export const permissionsForRole = (role: string): readonly Permission[] =>
  ROLE_PERMISSIONS[normalizeRole(role) as OrgRole | PlatformRole] ?? [];

export const hasPermission = (role: string, permission: Permission): boolean =>
  permissionsForRole(role).includes(permission);
