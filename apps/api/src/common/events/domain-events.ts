import { ActivityAction, EntityType, NotificationType } from '../constants/domain.constants';

export const DomainEvent = {
  ACTIVITY_RECORDED: 'activity.recorded',
  NOTIFICATION_REQUESTED: 'notification.requested',
  TASK_CHANGED: 'task.changed',
} as const;

export interface ActivityRecordedEvent {
  organizationId: string;
  projectId?: string | null;
  actorId: string;
  entityType: EntityType;
  entityId: string;
  action: ActivityAction;
  summary: string;
  metadata?: Record<string, unknown>;
}
export const ActivityRecordedEvent = {};

export type TaskChangeKind = 'created' | 'status_changed' | 'priority_changed' | 'assigned';

/** A task changed in a way automations can react to. */
export interface TaskChangedEvent {
  organizationId: string;
  projectId: string;
  taskId: string;
  actorId: string;
  kind: TaskChangeKind;
  /** New status / priority, or the users that were just assigned. */
  statusId?: string;
  priorityId?: string;
  assigneeIds?: string[];
  /** How many automations led to this change; used to stop rule loops. */
  depth?: number;
}
export const TaskChangedEvent = {};

export interface NotificationRequestedEvent {
  recipientIds: string[];
  actorId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}
export const NotificationRequestedEvent = {};

/** Client-side routes notifications deep-link to. */
export const NotificationLinks = {
  home: () => `/home`,
  organizationSettings: () => `/settings/organization`,
  project: (projectId: string) => `/projects/${projectId}`,
  task: (projectId: string, taskId: string) => `/projects/${projectId}?taskId=${taskId}`,
  issue: (projectId: string, issueId: string) => `/projects/${projectId}/issues?issueId=${issueId}`,
  timesheet: () => `/timesheets`,
  /** `day` is a YYYY-MM-DD date in the organization's time zone. */
  calendar: (day: string) => `/calendar?date=${day}`,
  projectTimesheet: (projectId: string) => `/projects/${projectId}/timesheets`,
};
