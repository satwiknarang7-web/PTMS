'use client';

import { Bell, CheckCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn, localizeTimes, timeAgo } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Dropdown } from '@/shared/ui/dropdown';
import { EmptyState, Spinner } from '@/shared/ui/feedback';
import { useMarkAllRead, useMarkRead, useNotifications, useUnreadCount, type Notification } from '../api';

export function NotificationBell() {
  const router = useRouter();
  const { data: unread } = useUnreadCount();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const count = unread?.count ?? 0;

  const open = (notification: Notification, close: () => void) => {
    if (!notification.readAt) markRead.mutate(notification.id);
    close();
    if (notification.link) router.push(notification.link);
  };

  return (
    <Dropdown
      // On phones the panel spans the screen under the header instead of hanging off the bell.
      className="w-96 p-0 max-sm:fixed max-sm:inset-x-3 max-sm:top-14 max-sm:w-auto"
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label={`Notifications${count ? ` (${count} unread)` : ''}`}
          className="relative flex size-9 items-center justify-center rounded-ui text-muted hover:bg-surface-muted hover:text-foreground"
        >
          <Bell className="size-5" />
          {count > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </button>
      )}
    >
      {(close) => <NotificationPanel onOpen={(n) => open(n, close)} onMarkAll={() => markAllRead.mutate()} hasUnread={count > 0} />}
    </Dropdown>
  );
}

function NotificationPanel({ onOpen, onMarkAll, hasUnread }: { onOpen: (n: Notification) => void; onMarkAll: () => void; hasUnread: boolean }) {
  const { data, isLoading } = useNotifications(true);
  return (
    <div>
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-sm font-semibold">Notifications</span>
        {hasUnread && (
          <Button variant="ghost" size="sm" onClick={onMarkAll}>
            <CheckCheck className="size-3.5" /> Mark all read
          </Button>
        )}
      </div>
      <div className="scrollbar-thin max-h-96 overflow-y-auto">
        {isLoading ? (
          <Spinner />
        ) : !data?.data.length ? (
          <EmptyState title="You're all caught up" description="Assignments, status changes, comments and due date reminders show up here." />
        ) : (
          data.data.map((notification) => (
            <button
              key={notification.id}
              type="button"
              onClick={() => onOpen(notification)}
              className={cn('flex w-full gap-3 border-b border-border px-4 py-3 text-left last:border-0 hover:bg-surface-muted', !notification.readAt && 'bg-brand-soft/40')}
            >
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', notification.readAt ? 'bg-transparent' : 'bg-brand')} />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{localizeTimes(notification.title)}</span>
                {notification.body && <span className="block truncate text-xs text-muted">{notification.body}</span>}
                <span className="mt-0.5 block text-[11px] text-muted">{timeAgo(notification.createdAt)}</span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
