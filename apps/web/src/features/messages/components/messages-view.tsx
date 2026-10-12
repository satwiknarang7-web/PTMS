'use client';

import { ArrowLeft, MessageCircle, Plus, Search, Send } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { routes } from '@/shared/config/routes';
import { useSession } from '@/features/auth/api';
import { roleLabel } from '@/shared/constants/domain';
import { useQueryParam } from '@/shared/hooks/use-query-param';
import { cn, fullName, timeAgo } from '@/shared/lib/utils';
import { Avatar } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { EmptyState, Spinner } from '@/shared/ui/feedback';
import { Input, Textarea } from '@/shared/ui/form';
import { PageHeader } from '@/shared/ui/layout';
import { Modal } from '@/shared/ui/modal';
import {
  useContacts,
  useConversations,
  useMarkRead,
  useSendMessage,
  useStartConversation,
  useThread,
  type Contact,
  type Conversation,
} from '../api';

const describe = (person: Contact) => person.jobTitle || roleLabel(person.role);

/** One-to-one chats: the list of conversations and the open chat side by side (one at a time on phones). */
export function MessagesView() {
  const [conversationId, setConversationId] = useQueryParam('c');
  const startWith = useSearchParams().get('to');
  const router = useRouter();
  const { data: conversations, isLoading } = useConversations();
  const start = useStartConversation();
  const [picking, setPicking] = useState(false);
  const [started, setStarted] = useState<Conversation | null>(null);

  // `?to=<userId>` (e.g. "Message" on a project's team) opens the chat with that person.
  useEffect(() => {
    if (!startWith || start.isPending) return;
    start.mutate(startWith, {
      // One URL change: open the chat and drop `to`, so a reload does not start it again.
      onSuccess: (conversation) => {
        setStarted(conversation);
        router.replace(`${routes.messages}?c=${conversation.id}`, { scroll: false });
      },
      onError: () => router.replace(routes.messages, { scroll: false }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startWith]);

  const open = conversations?.find((c) => c.id === conversationId) ?? (started?.id === conversationId ? started : null);

  return (
    <>
      <PageHeader title="Messages" description="Private one-to-one chats with the people you work with." />
      <Card className="flex h-[calc(100dvh-14rem)] min-h-[26rem] overflow-hidden">
        <aside className={cn('flex w-full shrink-0 flex-col border-r border-border md:w-80', conversationId && 'max-md:hidden')}>
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <span className="text-sm font-semibold">Chats</span>
            <Button size="sm" onClick={() => setPicking(true)}>
              <Plus /> New chat
            </Button>
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <Spinner />
            ) : !conversations?.length ? (
              <EmptyState icon={<MessageCircle />} title="No chats yet" description="Start one with “New chat”." className="py-10" />
            ) : (
              <ul>
                {conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      onClick={() => setConversationId(conversation.id)}
                      className={cn(
                        'flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors hover:bg-surface-hover',
                        conversation.id === conversationId && 'bg-brand-soft/50',
                      )}
                    >
                      <Avatar user={conversation.other} size="md" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className={cn('truncate text-sm', conversation.unread ? 'font-semibold' : 'font-medium')}>{fullName(conversation.other)}</span>
                          {conversation.lastMessageAt && <span className="shrink-0 text-[11px] text-muted">{timeAgo(conversation.lastMessageAt)}</span>}
                        </span>
                        <span className="flex items-center justify-between gap-2">
                          <span className={cn('truncate text-xs', conversation.unread ? 'text-foreground' : 'text-muted')}>
                            {conversation.lastMessage?.body ?? describe(conversation.other)}
                          </span>
                          {conversation.unread > 0 && (
                            <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-brand-foreground">
                              {conversation.unread}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
        <section className={cn('min-w-0 flex-1 flex-col', conversationId ? 'flex' : 'max-md:hidden md:flex')}>
          {open ? (
            <Thread key={open.id} conversation={open} onBack={() => setConversationId(null)} />
          ) : conversationId ? (
            <Spinner />
          ) : (
            <EmptyState icon={<MessageCircle />} title="Choose a chat" description="Or start a new one to message a teammate." className="m-auto" />
          )}
        </section>
      </Card>
      <ContactPicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(contact) => {
          setPicking(false);
          start.mutate(contact.id, {
            onSuccess: (conversation) => {
              setStarted(conversation);
              setConversationId(conversation.id);
            },
          });
        }}
      />
    </>
  );
}

function Thread({ conversation, onBack }: { conversation: Conversation; onBack: () => void }) {
  const { data: session } = useSession();
  const { data, isLoading } = useThread(conversation.id);
  const send = useSendMessage(conversation.id);
  const markRead = useMarkRead();
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const messages = useMemo(() => data?.data ?? [], [data]);
  const lastId = messages[messages.length - 1]?.id;

  // Keep the newest message in view and count it as read.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    if (lastId) markRead.mutate(conversation.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId, conversation.id]);

  const submit = () => {
    const body = draft.trim();
    if (!body || send.isPending) return;
    send.mutate(body, { onSuccess: () => setDraft('') });
  };

  return (
    <>
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button type="button" onClick={onBack} aria-label="Back to chats" className="-ml-1 rounded-ui p-1 text-muted hover:text-foreground md:hidden">
          <ArrowLeft className="size-5" />
        </button>
        <Avatar user={conversation.other} size="md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{fullName(conversation.other)}</p>
          <p className="truncate text-xs text-muted">{describe(conversation.other)}</p>
        </div>
      </header>
      <div ref={listRef} className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto bg-surface-muted/40 px-4 py-4">
        {isLoading ? (
          <Spinner />
        ) : !messages.length ? (
          <p className="py-10 text-center text-sm text-muted">Say hello to {conversation.other.firstName}.</p>
        ) : (
          messages.map((message) => {
            const mine = message.senderId === session?.id;
            return (
              <div key={message.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-ui-sm',
                    mine ? 'rounded-br-md bg-brand text-brand-foreground' : 'rounded-bl-md border border-border bg-surface',
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{message.body}</p>
                  <p className={cn('mt-0.5 text-right text-[10px]', mine ? 'opacity-75' : 'text-muted')}>
                    {new Date(message.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
      <form
        className="flex items-end gap-2 border-t border-border px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Textarea
          rows={1}
          value={draft}
          placeholder={`Message ${conversation.other.firstName}… (Enter to send)`}
          className="max-h-32 min-h-10 flex-1 resize-none"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button type="submit" size="icon" aria-label="Send" loading={send.isPending} disabled={!draft.trim()}>
          <Send />
        </Button>
      </form>
    </>
  );
}

function ContactPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (contact: Contact) => void }) {
  const { data: contacts, isLoading } = useContacts(open);
  const [search, setSearch] = useState('');
  const shown = (contacts ?? []).filter((c) => `${fullName(c)} ${c.jobTitle ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()));
  return (
    <Modal open={open} onClose={onClose} title="New chat" description="Choose who to message." size="sm">
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input autoFocus placeholder="Search people" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {isLoading ? (
          <Spinner />
        ) : !shown.length ? (
          <p className="py-6 text-center text-sm text-muted">No one to show.</p>
        ) : (
          <ul className="scrollbar-thin -mx-2 max-h-80 overflow-y-auto">
            {shown.map((contact) => (
              <li key={contact.id}>
                <button
                  type="button"
                  onClick={() => onPick(contact)}
                  className="flex w-full items-center gap-3 rounded-ui px-2 py-2 text-left hover:bg-surface-hover"
                >
                  <Avatar user={contact} size="md" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{fullName(contact)}</span>
                    <span className="block truncate text-xs text-muted">{describe(contact)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
