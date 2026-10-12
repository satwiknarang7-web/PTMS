/**
 * Platform-level role: creates organizations, appoints their project coordinators and holds every
 * coordinator permission inside any organization it opens. Never belongs to an organization.
 */
export const PlatformRole = {
  ROOT: 'ROOT',
} as const;
export type PlatformRole = (typeof PlatformRole)[keyof typeof PlatformRole];

/** Organization-wide roles, ordered from most to least privileged. */
export const OrgRole = {
  PROJECT_COORDINATOR: 'PROJECT_COORDINATOR',
  MEMBER: 'MEMBER',
  /** A client: sees the dashboards of the projects they are added to and their client meetings. */
  VIEWER: 'VIEWER',
} as const;
export type OrgRole = (typeof OrgRole)[keyof typeof OrgRole];
export const ORG_ROLES = Object.values(OrgRole);

/** Roles stored by earlier versions and the role each one now maps to. */
export const LEGACY_ORG_ROLES: Record<string, OrgRole> = {
  SUPER_ADMIN: OrgRole.PROJECT_COORDINATOR,
  ADMIN: OrgRole.PROJECT_COORDINATOR,
  OWNER: OrgRole.PROJECT_COORDINATOR,
  MANAGER: OrgRole.PROJECT_COORDINATOR,
  EMPLOYEE: OrgRole.MEMBER,
  GUEST: OrgRole.MEMBER,
};

/** Maps a stored role (including legacy names) to the role it grants today. */
export const normalizeRole = (role: string): string => LEGACY_ORG_ROLES[role] ?? role;

/**
 * Role a user holds inside a single project. Every member works on the project's items;
 * managing the project itself (settings, members, automations) is reserved to coordinators.
 */
export const ProjectRole = {
  MEMBER: 'MEMBER',
} as const;
export type ProjectRole = (typeof ProjectRole)[keyof typeof ProjectRole];

export const isViewer = (role: string): boolean => role === OrgRole.VIEWER;
export const isRoot = (role: string): boolean => role === PlatformRole.ROOT;
/** Root acts with coordinator authority inside whichever organization it has opened. */
export const isCoordinator = (role: string): boolean => normalizeRole(role) === OrgRole.PROJECT_COORDINATOR || isRoot(role);
