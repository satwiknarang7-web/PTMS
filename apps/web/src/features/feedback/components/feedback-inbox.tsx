'use client';

import { Check, MessageSquareHeart, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { roleLabel } from '@/shared/constants/domain';
import { errorMessage } from '@/shared/lib/api-client';
import { cn, formatDateTime, fullName } from '@/shared/lib/utils';
import { Avatar } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { EmptyState, ErrorState, Spinner } from '@/shared/ui/feedback';
import { PageHeader } from '@/shared/ui/layout';
import { ConfirmDialog } from '@/shared/ui/modal';
import { useDeleteFeedback, usePlatformFeedback, useResolveFeedback, type FeedbackItem } from '../api';

type Filter = 'open' | 'resolved' | 'all';

/** Everything people suggested about the app (root admins only). */
export function FeedbackInbox() {
  const { data, isLoading, isError, error, refetch } = usePlatformFeedback();
  const resolve = useResolveFeedback();
  const remove = useDeleteFeedback();
  const [filter, setFilter] = useState<Filter>('open');
  const [deleting, setDeleting] = useState<FeedbackItem | null>(null);

  const items = (data ?? []).filter((item) => (filter === 'all' ? true : filter === 'open' ? !item.resolvedAt : !!item.resolvedAt));
  const openCount = (data ?? []).filter((item) => !item.resolvedAt).length;

  return (
    <>
      <PageHeader
        title="Feedback"
        description="Suggestions from everyone using the app. Only root admins can see this page."
        actions={
          <div className="inline-flex rounded-ui border border-border bg-surface-muted p-0.5 text-sm">
            {(['open', 'resolved', 'all'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={cn('rounded-[calc(var(--radius)-2px)] px-3 py-1 capitalize', filter === value ? 'bg-surface font-medium shadow-ui-sm' : 'text-muted hover:text-foreground')}
              >
                {value === 'open' ? `Open (${openCount})` : value}
              </button>
            ))}
          </div>
        }
      />
      {isLoading ? (
        <Spinner />
      ) : isError ? (
        <ErrorState message={errorMessage(error)} onRetry={refetch} />
      ) : !items.length ? (
        <Card>
          <EmptyState
            icon={<MessageSquareHeart />}
            title={filter === 'open' ? 'No open feedback' : 'Nothing here'}
            description="People send feedback from “Send feedback” in the sidebar or their account menu."
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <Card className={cn('p-[var(--card-p)]', item.resolvedAt && 'opacity-70')}>
                <div className="flex flex-wrap items-start gap-3">
                  <Avatar user={item.user} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">{fullName(item.user)}</span>
                      <Badge>{roleLabel(item.user.role)}</Badge>
                      {item.organizationName && <span className="text-xs text-muted">{item.organizationName}</span>}
                      {item.resolvedAt && <Badge tone="success">Done</Badge>}
                    </p>
                    <p className="text-xs text-muted">
                      {item.user.email} · {formatDateTime(item.createdAt)}
                      {item.page && ` · on ${item.page}`}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm">{item.body}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={resolve.isPending && resolve.variables?.id === item.id}
                      onClick={() => resolve.mutate({ id: item.id, resolved: !item.resolvedAt })}
                    >
                      {item.resolvedAt ? <RotateCcw /> : <Check />} {item.resolvedAt ? 'Reopen' : 'Mark done'}
                    </Button>
                    <Button size="icon" variant="ghost" aria-label="Delete feedback" onClick={() => setDeleting(item)}>
                      <Trash2 className="text-danger" />
                    </Button>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete feedback"
        message="This feedback will be removed for good."
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
    </>
  );
}
