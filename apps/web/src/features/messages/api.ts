'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, apiUrl } from '@/shared/lib/api-client';
import type { UserSummary } from '@/shared/types/api';

export interface Contact extends UserSummary {
  jobTitle: string | null;
  role: string;
}

export interface Conversation {
  id: string;
  other: Contact;
  lastMessage: { body: string; senderId: string; createdAt: string } | null;
  lastMessageAt: string | null;
  unread: number;
}

export interface MessageImage {
  id: string;
  mimeType: string;
  size: number;
}

export interface DirectMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  attachments: MessageImage[];
}

/** Where a chat image is shown from (only the two people in the chat may open it). */
export const messageImageUrl = (id: string) => apiUrl(`/messages/images/${id}`);

export function uploadMessageImage(conversationId: string, image: Blob) {
  return api.post<MessageImage>('/messages/images', image, { query: { conversationId } });
}

export function discardMessageImage(id: string) {
  return api.delete(`/messages/images/${id}`);
}

export const messageKeys = {
  all: ['messages'] as const,
  contacts: ['messages', 'contacts'] as const,
  conversations: ['messages', 'conversations'] as const,
  unread: ['messages', 'unread'] as const,
  thread: (id: string) => ['messages', 'thread', id] as const,
};

/** There is no live connection: open chats check for new messages every few seconds. */
const THREAD_POLL_MS = 4000;
const LIST_POLL_MS = 10_000;
const UNREAD_POLL_MS = 30_000;

export function useContacts(enabled = true) {
  return useQuery({ queryKey: messageKeys.contacts, queryFn: () => api.get<Contact[]>('/messages/contacts'), enabled, staleTime: 60_000 });
}

export function useConversations() {
  return useQuery({ queryKey: messageKeys.conversations, queryFn: () => api.get<Conversation[]>('/messages/conversations'), refetchInterval: LIST_POLL_MS });
}

export function useUnreadMessages(enabled = true) {
  return useQuery({
    queryKey: messageKeys.unread,
    queryFn: () => api.get<{ count: number }>('/messages/unread-count'),
    enabled,
    refetchInterval: UNREAD_POLL_MS,
  });
}

export function useThread(conversationId: string | null) {
  return useQuery({
    queryKey: messageKeys.thread(conversationId ?? ''),
    queryFn: () => api.get<{ data: DirectMessage[]; hasMore: boolean }>(`/messages/conversations/${conversationId}/messages`),
    enabled: !!conversationId,
    refetchInterval: THREAD_POLL_MS,
  });
}

export function useStartConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.post<Conversation>('/messages/conversations', { userId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: messageKeys.conversations }),
  });
}

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; attachmentIds?: string[] }) => api.post<DirectMessage>(`/messages/conversations/${conversationId}/messages`, input),
    onSuccess: (message) => {
      queryClient.setQueryData<{ data: DirectMessage[]; hasMore: boolean }>(messageKeys.thread(conversationId), (current) =>
        current ? { ...current, data: [...current.data.filter((m) => m.id !== message.id), message] } : current,
      );
      void queryClient.invalidateQueries({ queryKey: messageKeys.conversations });
    },
  });
}

export function useMarkRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => api.post<void>(`/messages/conversations/${conversationId}/read`),
    meta: { silentError: true },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: messageKeys.unread });
      void queryClient.invalidateQueries({ queryKey: messageKeys.conversations });
    },
  });
}
