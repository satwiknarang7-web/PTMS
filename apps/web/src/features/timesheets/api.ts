'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApprovalStatus } from '@/shared/constants/domain';
import { api } from '@/shared/lib/api-client';
import type { Paginated, UserSummary } from '@/shared/types/api';
import type { TimeEntry, TimeEntryInput, TimeEntryQuery, TimeSummary } from './types';

export const timesheetKeys = {
  all: ['time-entries'] as const,
  list: (query: TimeEntryQuery) => ['time-entries', 'list', query] as const,
  summary: (query: TimeEntryQuery) => ['time-entries', 'summary', query] as const,
};

export function useTimeEntries(query: TimeEntryQuery) {
  return useQuery({
    queryKey: timesheetKeys.list(query),
    queryFn: () => api.get<Paginated<TimeEntry>>('/time-entries', { ...query }),
    placeholderData: keepPreviousData,
  });
}

/** People to filter time by: the organization plus root admins working on its projects. */
export function useTimesheetPeople(projectId?: string, enabled = true) {
  return useQuery({
    queryKey: ['time-entries', 'people', projectId ?? null] as const,
    queryFn: () => api.get<UserSummary[]>('/time-entries/people', projectId ? { projectId } : undefined),
    enabled,
    staleTime: 60_000,
  });
}

export function useTimeSummary(query: Omit<TimeEntryQuery, 'page' | 'limit'>) {
  return useQuery({
    queryKey: timesheetKeys.summary(query),
    queryFn: () => api.get<TimeSummary>('/time-entries/summary', { ...query }),
    placeholderData: keepPreviousData,
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: timesheetKeys.all });
    void queryClient.invalidateQueries({ queryKey: ['tasks', 'detail'] });
    void queryClient.invalidateQueries({ queryKey: ['projects', 'dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

export function useSaveTimeEntry() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, projectId, ...input }: TimeEntryInput & { id?: string }) =>
      id ? api.patch<TimeEntry>(`/time-entries/${id}`, input) : api.post<TimeEntry>('/time-entries', { ...input, projectId }),
    meta: { successMessage: 'Time saved' },
    onSuccess: invalidate,
  });
}

export function useDeleteTimeEntry() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/time-entries/${id}`),
    meta: { successMessage: 'Time entry deleted' },
    onSuccess: invalidate,
  });
}

export function useReviewTimeEntry() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ApprovalStatus }) => api.post<TimeEntry>(`/time-entries/${id}/review`, { status }),
    onSuccess: invalidate,
  });
}
