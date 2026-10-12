/**
 * Mirrors of the API's enumerated values (apps/api/src/common/constants).
 * Display names for configurable values (statuses, priorities…) always come from the API.
 */
export const Permission = {
  PLATFORM_MANAGE: 'platform:manage',
  COORDINATORS_MANAGE: 'coordinators:manage',
  ORG_MANAGE: 'org:manage',
  USERS_VIEW: 'users:view',
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

/** Platform-level account: creates organizations and appoints their project coordinators. */
export const PLATFORM_ROOT_ROLE = 'ROOT';

export const OrgRole = {
  PROJECT_COORDINATOR: 'PROJECT_COORDINATOR',
  MEMBER: 'MEMBER',
  /** Client: project dashboards and client meetings of the projects they are added to. */
  VIEWER: 'VIEWER',
} as const;
export type OrgRole = (typeof OrgRole)[keyof typeof OrgRole];
export const ORG_ROLES = Object.values(OrgRole);

/** Display names of the roles (including root, which acts as a coordinator inside a workspace). */
export const ROLE_LABELS: Record<string, string> = {
  [PLATFORM_ROOT_ROLE]: 'Root',
  [OrgRole.PROJECT_COORDINATOR]: 'Project coordinator',
  [OrgRole.MEMBER]: 'Member',
  [OrgRole.VIEWER]: 'Client (viewer)',
};
export const isViewerRole = (role: string | undefined) => role === OrgRole.VIEWER;
export const roleLabel = (role: string) => ROLE_LABELS[role] ?? role;

export const MeetingType = {
  INTERNAL: 'INTERNAL',
  CLIENT: 'CLIENT',
} as const;
export type MeetingType = (typeof MeetingType)[keyof typeof MeetingType];

export const LookupType = {
  PROJECT_STATUS: 'PROJECT_STATUS',
  TASK_STATUS: 'TASK_STATUS',
  ISSUE_STATUS: 'ISSUE_STATUS',
  PRIORITY: 'PRIORITY',
  ISSUE_SEVERITY: 'ISSUE_SEVERITY',
} as const;
export type LookupType = (typeof LookupType)[keyof typeof LookupType];

export const StatusCategory = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  CLOSED: 'CLOSED',
} as const;
export type StatusCategory = (typeof StatusCategory)[keyof typeof StatusCategory];

export const ApprovalStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type ApprovalStatus = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

export const ProjectHealth = {
  ON_TRACK: 'ON_TRACK',
  AT_RISK: 'AT_RISK',
  OFF_TRACK: 'OFF_TRACK',
  COMPLETED: 'COMPLETED',
} as const;
export type ProjectHealth = (typeof ProjectHealth)[keyof typeof ProjectHealth];
