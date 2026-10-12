import type { UserSummary } from '@/shared/types/api';

export interface PlatformOrganization {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  timezone: string;
  createdAt: string;
  _count: { users: number; projects: number };
}

export interface PlatformOrganizationPerson extends UserSummary {
  role: string;
  jobTitle: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
}

export interface PlatformOrganizationDetail extends PlatformOrganization {
  coordinators: PlatformOrganizationPerson[];
  /** Everyone in the organization, coordinators included. */
  people: PlatformOrganizationPerson[];
}

export interface PlatformOrganizationQuery {
  search?: string;
  status?: 'active' | 'suspended';
  page?: number;
  limit?: number;
}

export interface CreateOrganizationInput {
  name: string;
  coordinator: { firstName: string; lastName: string; email: string; password?: string };
}

export interface PlatformOverview {
  organizations: { total: number; active: number; suspended: number };
  users: number;
  coordinators: number;
  projects: number;
  recentOrganizations: { id: string; name: string; slug: string; isActive: boolean; createdAt: string; _count: { users: number } }[];
}

/** A root admin: platform-level account that runs organizations and appoints coordinators. */
export interface PlatformAdmin {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  jobTitle: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}
