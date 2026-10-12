/** Kinds of configurable lookup values an organization maintains. */
export const LookupType = {
  PROJECT_STATUS: 'PROJECT_STATUS',
  TASK_STATUS: 'TASK_STATUS',
  ISSUE_STATUS: 'ISSUE_STATUS',
  PRIORITY: 'PRIORITY',
  ISSUE_SEVERITY: 'ISSUE_SEVERITY',
} as const;
export type LookupType = (typeof LookupType)[keyof typeof LookupType];
export const LOOKUP_TYPES = Object.values(LookupType);
export const STATUS_LOOKUP_TYPES: readonly LookupType[] = [
  LookupType.PROJECT_STATUS,
  LookupType.TASK_STATUS,
  LookupType.ISSUE_STATUS,
];

/** Semantic bucket of a status, used for progress & reporting regardless of its custom name. */
export const StatusCategory = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  CLOSED: 'CLOSED',
} as const;
export type StatusCategory = (typeof StatusCategory)[keyof typeof StatusCategory];
export const STATUS_CATEGORIES = Object.values(StatusCategory);

export const ApprovalStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type ApprovalStatus = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];
export const APPROVAL_STATUSES = Object.values(ApprovalStatus);

export const DependencyType = {
  FINISH_TO_START: 'FS',
  START_TO_START: 'SS',
  FINISH_TO_FINISH: 'FF',
  START_TO_FINISH: 'SF',
} as const;
export type DependencyType = (typeof DependencyType)[keyof typeof DependencyType];
export const DEPENDENCY_TYPES = Object.values(DependencyType);

export const EntityType = {
  PROJECT: 'PROJECT',
  TASK: 'TASK',
  ISSUE: 'ISSUE',
  MILESTONE: 'MILESTONE',
  TASK_LIST: 'TASK_LIST',
  TIME_ENTRY: 'TIME_ENTRY',
  COMMENT: 'COMMENT',
  MEMBER: 'MEMBER',
} as const;
export type EntityType = (typeof EntityType)[keyof typeof EntityType];

export const ActivityAction = {
  CREATED: 'CREATED',
  UPDATED: 'UPDATED',
  DELETED: 'DELETED',
  STATUS_CHANGED: 'STATUS_CHANGED',
  ASSIGNED: 'ASSIGNED',
  COMMENTED: 'COMMENTED',
  COMPLETED: 'COMPLETED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  JOINED: 'JOINED',
  LEFT: 'LEFT',
} as const;
export type ActivityAction = (typeof ActivityAction)[keyof typeof ActivityAction];

export const NotificationType = {
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  TASK_STATUS_CHANGED: 'TASK_STATUS_CHANGED',
  TASK_DUE_DATE_CHANGED: 'TASK_DUE_DATE_CHANGED',
  ISSUE_ASSIGNED: 'ISSUE_ASSIGNED',
  ISSUE_STATUS_CHANGED: 'ISSUE_STATUS_CHANGED',
  COMMENT_ADDED: 'COMMENT_ADDED',
  PROJECT_ADDED: 'PROJECT_ADDED',
  PROJECT_REMOVED: 'PROJECT_REMOVED',
  PROJECT_STATUS_CHANGED: 'PROJECT_STATUS_CHANGED',
  MEETING_TODAY: 'MEETING_TODAY',
  MEETING_SCHEDULED: 'MEETING_SCHEDULED',
  TIME_ENTRY_REVIEWED: 'TIME_ENTRY_REVIEWED',
  TIME_ENTRY_SUBMITTED: 'TIME_ENTRY_SUBMITTED',
  DUE_SOON: 'DUE_SOON',
  OVERDUE: 'OVERDUE',
  AUTOMATION: 'AUTOMATION',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const SortOrder = { ASC: 'asc', DESC: 'desc' } as const;
export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder];
