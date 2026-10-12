'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiUrl } from '@/shared/lib/api-client';
import type { UserSummary } from '@/shared/types/api';

export interface Comment {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: UserSummary;
  attachments: CommentImage[];
}

export interface CommentImage {
  id: string;
  mimeType: string;
  size: number;
}

/** Where an attached image is shown from (only people who can see the task or issue may open it). */
export const commentImageUrl = (id: string) => apiUrl(`/comments/images/${id}`);

export type CommentTarget = { taskId: string; issueId?: never } | { issueId: string; taskId?: never };

export const commentKeys = {
  list: (target: CommentTarget) => ['comments', target.taskId ?? target.issueId] as const,
};

export function useComments(target: CommentTarget) {
  return useQuery({ queryKey: commentKeys.list(target), queryFn: () => api.get<Comment[]>('/comments', { ...target }) });
}

export function useAddComment(target: CommentTarget) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ body, attachmentIds }: { body: string; attachmentIds?: string[] }) =>
      api.post<Comment>('/comments', { ...target, body, attachmentIds }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: commentKeys.list(target) }),
  });
}

export function useUpdateComment(target: CommentTarget) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => api.patch<Comment>(`/comments/${id}`, { body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: commentKeys.list(target) }),
  });
}

export function useDeleteComment(target: CommentTarget) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/comments/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: commentKeys.list(target) }),
  });
}

/** Uploads one (already shrunk) image for a comment that is about to be posted. */
export function uploadCommentImage(target: CommentTarget, image: Blob) {
  return api.post<CommentImage>('/comments/images', image, { query: target.taskId ? { taskId: target.taskId } : { issueId: target.issueId } });
}

export function discardCommentImage(id: string) {
  return api.delete(`/comments/images/${id}`);
}
