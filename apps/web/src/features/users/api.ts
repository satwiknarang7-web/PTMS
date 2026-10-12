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

export function useUsers(query: UserQuery = {}, enabled = true) {
  return useQuery({
    queryKey: userKeys.list(query),
    queryFn: () => api.get<Paginated<User>>('/users', { ...query }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Every active user of the organization, for pickers. */
export function useActiveUsers(enabled = true) {
  return useUsers({ isActive: true, limit: appConfig.boardPageSize }, enabled);
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

/** Root admins only: permanently removes a person; their work goes to `transferTo` (or a coordinator). */
export function useRemoveUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, transferTo }: { id: string; transferTo?: string }) => api.delete(`/users/${id}`, transferTo ? { transferTo } : undefined),
    meta: { successMessage: 'Person removed' },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}

/** Clears someone's authenticator app (lost phone); they set it up again at their next sign-in. */
export function useResetTwoFactor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/users/${id}/reset-two-factor`),
    meta: { successMessage: 'Two-step sign-in reset. They will set it up again at their next sign-in.' },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
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

/** Profile photo: a square, shrunk copy of the picked image (see squarePhoto). */
export function useSetProfilePhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (photo: Blob | null) => (photo ? api.post<User>('/users/me/photo', photo) : api.delete<User>('/users/me/photo')),
    meta: { successMessage: 'Profile photo updated' },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: authKeys.session });
      void queryClient.invalidateQueries({ queryKey: userKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

/** Crops the picked image to a centred square and shrinks it to 400×400 JPEG (also drops photo location data). */
export async function squarePhoto(file: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG, GIF or WebP image');
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 400;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 400, 400);
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 400, 400);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  if (!blob) throw new Error('This image could not be read');
  return blob;
}
