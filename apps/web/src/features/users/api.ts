'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authKeys } from '@/features/auth/api';
import { appConfig } from '@/shared/config/env';
import { api } from '@/shared/lib/api-client';
import type { Paginated } from '@/shared/types/api';
import type { CreateUserInput, UpdateProfileInput, UpdateUserInput, User, UserDetails, UserQuery } from './types';

export const userKeys = {
  all: ['users'] as const,
  list: (query: UserQuery) => ['users', 'list', query] as const,
  details: (id: string) => ['users', 'details', id] as const,
};

/** A person's projects, open work, time and activity (coordinators and root). */
export function useUserDetails(id: string) {
  return useQuery({ queryKey: userKeys.details(id), queryFn: () => api.get<UserDetails>(`/users/${id}/details`), enabled: !!id });
}

export function useUsers(query: UserQuery = {}) {
  return useQuery({
    queryKey: userKeys.list(query),
    queryFn: () => api.get<Paginated<User>>('/users', { ...query }),
    placeholderData: keepPreviousData,
  });
}

/** Every active user of the organization, for pickers. */
export function useActiveUsers() {
  return useUsers({ isActive: true, limit: appConfig.boardPageSize });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => api.post<User>('/users', input),
    meta: { successMessage: 'User created' },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateUserInput & { id: string }) => api.patch<User>(`/users/${id}`, input),
    meta: { successMessage: 'User updated' },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}

/** Emails a link to choose a password (a new link; earlier ones stop working). */
export function useSendInvite() {
  return useMutation({
    mutationFn: (id: string) => api.post(`/users/${id}/invite`),
    meta: { successMessage: 'Email sent' },
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => api.post(`/users/${id}/reset-password`, { password }),
    meta: { successMessage: 'Password reset - the user has been signed out everywhere' },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => api.patch<User>('/users/me', input),
    meta: { successMessage: 'Profile updated' },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.session });
      void queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) => api.post('/users/me/password', input),
    meta: { silentError: true },
  });
}
