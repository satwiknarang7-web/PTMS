'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { routes } from '@/shared/config/routes';
import { api } from '@/shared/lib/api-client';
import type { Paginated } from '@/shared/types/api';
import type {
  CreateOrganizationInput,
  PlatformAdmin,
  PlatformOrganization,
  PlatformOrganizationDetail,
  PlatformOrganizationQuery,
  PlatformOverview,
} from './types';

export const platformKeys = {
  all: ['platform'] as const,
  overview: ['platform', 'overview'] as const,
  organizations: (query: PlatformOrganizationQuery) => ['platform', 'organizations', query] as const,
  organization: (id: string) => ['platform', 'organization', id] as const,
  admins: ['platform', 'admins'] as const,
};

export function usePlatformOverview() {
  return useQuery({ queryKey: platformKeys.overview, queryFn: () => api.get<PlatformOverview>('/platform/overview') });
}

export function usePlatformOrganizations(query: PlatformOrganizationQuery) {
  return useQuery({
    queryKey: platformKeys.organizations(query),
    queryFn: () => api.get<Paginated<PlatformOrganization>>('/platform/organizations', { ...query }),
    placeholderData: keepPreviousData,
  });
}

export function usePlatformOrganization(id: string | null) {
  return useQuery({
    queryKey: platformKeys.organization(id ?? ''),
    queryFn: () => api.get<PlatformOrganizationDetail>(`/platform/organizations/${id}`),
    enabled: !!id,
  });
}

function useInvalidatePlatform() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: platformKeys.all });
}

export function useCreateOrganization() {
  const invalidate = useInvalidatePlatform();
  return useMutation({
    mutationFn: (input: CreateOrganizationInput) => api.post<PlatformOrganizationDetail>('/platform/organizations', input),
    meta: { successMessage: 'Organization created' },
    onSuccess: invalidate,
  });
}

export function useAddCoordinator() {
  const invalidate = useInvalidatePlatform();
  return useMutation({
    mutationFn: ({ organizationId, ...input }: { organizationId: string } & CreateOrganizationInput['coordinator']) =>
      api.post<PlatformOrganizationDetail>(`/platform/organizations/${organizationId}/coordinators`, input),
    meta: { successMessage: 'Coordinator added' },
    onSuccess: invalidate,
  });
}

export function useSendCoordinatorInvite() {
  return useMutation({
    mutationFn: ({ organizationId, userId }: { organizationId: string; userId: string }) =>
      api.post<void>(`/platform/organizations/${organizationId}/coordinators/${userId}/invite`),
    meta: { successMessage: 'Email sent' },
  });
}

/** Permanently removes someone from an organization; their work goes to `transferTo` (or a coordinator). */
export function useRemoveOrganizationUser() {
  const invalidate = useInvalidatePlatform();
  return useMutation({
    mutationFn: ({ organizationId, userId, transferTo }: { organizationId: string; userId: string; transferTo?: string }) =>
      api.delete<void>(`/platform/organizations/${organizationId}/users/${userId}`, transferTo ? { transferTo } : undefined),
    meta: { successMessage: 'Person removed' },
    onSuccess: invalidate,
  });
}

// ─── Root admins ─────────────────────────────────────────────

export function usePlatformAdmins() {
  return useQuery({ queryKey: platformKeys.admins, queryFn: () => api.get<PlatformAdmin[]>('/platform/admins') });
}

export function useCreatePlatformAdmin() {
  const invalidate = useInvalidatePlatform();
  return useMutation({
    mutationFn: (input: CreateOrganizationInput['coordinator']) => api.post<PlatformAdmin>('/platform/admins', input),
    meta: { successMessage: 'Root admin added' },
    onSuccess: invalidate,
  });
}

export function useUpdatePlatformAdmin() {
  const invalidate = useInvalidatePlatform();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.patch<PlatformAdmin>(`/platform/admins/${id}`, { isActive }),
    meta: { successMessage: 'Root admin updated' },
    onSuccess: invalidate,
  });
}

export function useSendPlatformAdminInvite() {
  return useMutation({
    mutationFn: (id: string) => api.post<void>(`/platform/admins/${id}/invite`),
    meta: { successMessage: 'Email sent' },
  });
}

export function useUpdatePlatformOrganization() {
  const invalidate = useInvalidatePlatform();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; name?: string; isActive?: boolean }) =>
      api.patch<PlatformOrganizationDetail>(`/platform/organizations/${id}`, input),
    meta: { successMessage: 'Organization updated' },
    onSuccess: invalidate,
  });
}

export function useDeletePlatformOrganization() {
  const invalidate = useInvalidatePlatform();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/platform/organizations/${id}`),
    meta: { successMessage: 'Organization deleted' },
    onSuccess: invalidate,
  });
}

/**
 * Root opens an organization's workspace and acts there with coordinator authority.
 * Every cached query belongs to the previous context, so the cache is reset.
 */
export function useEnterWorkspace() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (organizationId: string) => api.post<void>(`/platform/workspace/${organizationId}`),
    onSuccess: () => {
      queryClient.clear();
      router.push(routes.home);
    },
  });
}

export function useExitWorkspace() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: () => api.delete<void>('/platform/workspace'),
    onSuccess: () => {
      queryClient.clear();
      router.push(routes.platform);
    },
  });
}
