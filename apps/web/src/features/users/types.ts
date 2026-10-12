import type { OrgRole } from '@/shared/constants/domain';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  avatarUrl: string | null;
  role: OrgRole;
  isActive: boolean;
  hourlyRate: number | null;
  lastLoginAt: string | null;
  /** When the person set up their authenticator app; null until then. */
  twoFactorEnabledAt: string | null;
  createdAt: string;
}

export interface UserQuery {
  page?: number;
  limit?: number;
  search?: string;
  role?: OrgRole;
  isActive?: boolean;
}

export interface CreateUserInput {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  role: OrgRole;
  jobTitle?: string | null;
  hourlyRate?: number | null;
}

export type UpdateUserInput = Partial<Omit<CreateUserInput, 'email' | 'password'>> & { isActive?: boolean };

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
  jobTitle?: string | null;
  avatarUrl?: string | null;
}

interface LookupRef {
  id: string;
  name: string;
  color: string;
  category: string | null;
}

interface ProjectRef {
  id: string;
  name: string;
  key: string;
  color: string | null;
}

/** Everything coordinators see about one person (GET /users/:id/details). */
export interface UserDetails {
  user: User;
  stats: {
    projects: number;
    openTasks: number;
    overdueTasks: number;
    completedTasks30d: number;
    openIssues: number;
    minutesThisWeek: number;
    minutes30d: number;
  };
  projects: (ProjectRef & { isArchived: boolean; endDate: string | null; status: LookupRef; joinedAt: string; openTasks: number })[];
  tasks: { id: string; number: number; title: string; dueDate: string | null; progress: number; estimatedHours: number | null; status: LookupRef; priority: LookupRef; project: ProjectRef }[];
  issues: { id: string; number: number; title: string; dueDate: string | null; status: LookupRef; severity: LookupRef; project: ProjectRef }[];
  recentTime: { id: string; date: string; minutes: number; notes: string | null; approvalStatus: string; project: ProjectRef }[];
  activity: { id: string; summary: string; createdAt: string; project: { id: string; name: string } | null }[];
}
