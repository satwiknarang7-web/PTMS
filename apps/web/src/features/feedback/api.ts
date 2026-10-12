'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/lib/api-client';
import type { UserSummary } from '@/shared/types/api';

export interface FeedbackItem {
  id: string;
  body: string;
  page: string | null;
  resolvedAt: string | null;
  createdAt: string;
  organizationName: string | null;
  user: UserSummary & { email: string; role: string; jobTitle: string | null };
}

const feedbackKey = ['platform', 'feedback'] as const;

export function useSendFeedback() {
  return useMutation({
    mutationFn: (input: { body: string; page?: string }) => api.post<void>('/feedback', input),
    meta: { successMessage: 'Thank you! Your feedback was sent.' },
  });
}

/** Root admins only. */
export function usePlatformFeedback() {
  return useQuery({ queryKey: feedbackKey, queryFn: () => api.get<FeedbackItem[]>('/platform/feedback') });
}

export function useResolveFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, resolved }: { id: string; resolved: boolean }) => api.patch(`/platform/feedback/${id}`, { resolved }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: feedbackKey }),
  });
}

export function useDeleteFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/platform/feedback/${id}`),
    meta: { successMessage: 'Feedback deleted' },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: feedbackKey }),
  });
}
