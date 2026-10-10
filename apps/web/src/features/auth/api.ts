'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/lib/api-client';
import type { AuthConfig, LoginInput, SessionUser } from './types';

export const authKeys = {
  session: ['auth', 'session'] as const,
  config: ['auth', 'config'] as const,
};

export const authApi = {
  config: () => api.get<AuthConfig>('/auth/config'),
  me: () => api.get<SessionUser>('/auth/me'),
  login: (input: LoginInput) => api.post<{ success: boolean }>('/auth/login', input, { skipAuthRefresh: true }),
  logout: () => api.post<void>('/auth/logout', undefined, { skipAuthRefresh: true }),
  forgotPassword: (email: string) => api.post<void>('/auth/forgot-password', { email }, { skipAuthRefresh: true }),
  verifyToken: (token: string) => api.post<LinkInfo>('/auth/verify-token', { token }, { skipAuthRefresh: true }),
  resetPassword: (input: { token: string; password: string }) => api.post<void>('/auth/reset-password', input, { skipAuthRefresh: true }),
};

/** What an invitation or reset link is for, shown before the user chooses a password. */
export interface LinkInfo {
  purpose: 'INVITE' | 'PASSWORD_RESET';
  email: string;
  firstName: string;
}

export function useSession() {
  return useQuery({ queryKey: authKeys.session, queryFn: authApi.me, staleTime: 60_000, retry: false });
}

export function useAuthConfig() {
  return useQuery({ queryKey: authKeys.config, queryFn: authApi.config, staleTime: Infinity });
}

/** Minimum password length from the API policy (the API validates again). */
export function usePasswordMinLength(): number {
  const { data } = useAuthConfig();
  return data?.passwordPolicy.minLength ?? 1;
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.login,
    meta: { silentError: true },
    onSuccess: () => queryClient.clear(),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    onSettled: () => queryClient.clear(),
  });
}
