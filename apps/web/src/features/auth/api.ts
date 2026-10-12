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
  login: (input: LoginInput) => api.post<LoginResponse>('/auth/login', input, { skipAuthRefresh: true }),
  logout: () => api.post<void>('/auth/logout', undefined, { skipAuthRefresh: true }),
  /** Second sign-in step: a code from the authenticator app, or a one-time recovery code. */
  verifyTwoFactor: (input: { challenge: string; code?: string; recoveryCode?: string }) =>
    api.post<{ status: 'ok' }>('/auth/two-factor/verify', input, { skipAuthRefresh: true }),
  /** First sign-in: the QR code to scan. */
  setupTwoFactor: (challenge: string) => api.post<TwoFactorSetup>('/auth/two-factor/setup', { challenge }, { skipAuthRefresh: true }),
  activateTwoFactor: (input: { challenge: string; code: string }) =>
    api.post<{ status: 'ok'; recoveryCodes: string[] }>('/auth/two-factor/activate', input, { skipAuthRefresh: true }),
  twoFactorStatus: () => api.get<TwoFactorStatus>('/auth/two-factor'),
  regenerateRecoveryCodes: (code: string) => api.post<{ recoveryCodes: string[] }>('/auth/two-factor/recovery-codes', { code }),
};

/** Password step result: a session, or the authenticator step that must come first. */
export type LoginResponse =
  | { status: 'ok' }
  | { status: 'two_factor_required' | 'two_factor_setup_required'; challenge: string };

export interface TwoFactorSetup {
  /** Key for typing into the app by hand, grouped in fours. */
  secret: string;
  otpauthUrl: string;
  /** QR code image (data URL). */
  qrCode: string;
}

export interface TwoFactorStatus {
  enabled: boolean;
  enabledAt: string | null;
  required: boolean;
  recoveryCodesLeft: number;
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
