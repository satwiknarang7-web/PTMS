'use client';

import { MessageSquare, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSession } from '@/features/auth/api';
import { cn, fullName, timeAgo } from '@/shared/lib/utils';
import { Avatar } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { Dropdown, DropdownItem } from '@/shared/ui/dropdown';
import { Spinner } from '@/shared/ui/feedback';
import { Textarea } from '@/shared/ui/form';
import { useAddComment, useComments, useDeleteComment, useUpdateComment, type CommentTarget } from '../api';

/**
 * Comments of a task or issue. `inline` sits inside a page section; `panel` fills a side column:
 * the list scrolls on its own and the composer stays pinned at the bottom.
 */
export function CommentThread({ target, layout = 'inline' }: { target: CommentTarget; layout?: 'inline' | 'panel' }) {
  const { data: user } = useSession();
  const { data: comments, isLoading } = useComments(target);
  const add = useAddComment(target);
  const update = useUpdateComment(target);
  const remove = useDeleteComment(target);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panel = layout === 'panel';

  // In the side panel the newest comment is at the bottom: keep it in view.
  useEffect(() => {
    if (panel && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [panel, comments?.length]);

  const submit = () => {
    const body = draft.trim();
    if (body) add.mutate(body, { onSuccess: () => setDraft('') });
  };

  return (
    <div className={panel ? 'flex min-h-0 flex-1 flex-col' : 'space-y-4'}>
      <div ref={listRef} className={panel ? 'scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-4' : undefined}>
        {isLoading ? (
          <Spinner />
        ) : !comments?.length ? (
          panel ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted">
              <MessageSquare className="size-5" />
              No comments yet. Start the conversation.
            </div>
          ) : (
            <p className="text-sm text-muted">No comments yet. Start the conversation.</p>
          )
        ) : (
          <ul className="space-y-4">
            {comments.map((comment) => (
              <li key={comment.id} className="group/comment flex gap-3">
                <Avatar user={comment.author} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">{fullName(comment.author)}</span>
                    <span className="text-xs text-muted">
                      {timeAgo(comment.createdAt)}
                      {comment.updatedAt !== comment.createdAt && ' · edited'}
                    </span>
                    {comment.authorId === user?.id && editing?.id !== comment.id && (
                      <span className="ml-auto">
                        <Dropdown
                          trigger={({ open, toggle }) => (
                            <button
                              type="button"
                              aria-label="Comment actions"
                              aria-expanded={open}
                              onClick={toggle}
                              className={cn(
                                'flex size-6 items-center justify-center rounded-ui text-muted hover:bg-surface-muted hover:text-foreground focus-visible:opacity-100 group-hover/comment:opacity-100',
                                !open && 'sm:opacity-0',
                              )}
                            >
                              <MoreHorizontal className="size-4" />
                            </button>
                          )}
                        >
                          {(close) => (
                            <>
                              <DropdownItem
                                onClick={() => {
                                  close();
                                  setEditing({ id: comment.id, body: comment.body });
                                }}
                              >
                                <Pencil /> Edit comment
                              </DropdownItem>
                              <DropdownItem
                                danger
                                onClick={() => {
                                  close();
                                  remove.mutate(comment.id);
                                }}
                              >
                                <Trash2 /> Delete comment
                              </DropdownItem>
                            </>
                          )}
                        </Dropdown>
                      </span>
                    )}
                  </div>
                  {editing?.id === comment.id ? (
                    <div className="mt-2 space-y-2">
                      <Textarea
                        rows={3}
                        value={editing.body}
                        onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          loading={update.isPending}
                          onClick={() =>
                            editing.body.trim() &&
                            update.mutate(
                              { id: comment.id, body: editing.body.trim() },
                              { onSuccess: () => setEditing(null) },
                            )
                          }
                        >
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p
                      className={cn(
                        'mt-1 whitespace-pre-wrap break-words rounded-ui px-3 py-2 text-sm',
                        panel ? 'border border-border bg-surface' : 'bg-surface-muted',
                      )}
                    >
                      {comment.body}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={cn('flex gap-3', panel && 'border-t border-border bg-surface px-4 py-3')}>
        {user && <Avatar user={user} />}
        <div className="min-w-0 flex-1 space-y-2">
          <Textarea
            rows={2}
            placeholder="Write a comment… (Ctrl+Enter to send)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
            }}
          />
          {(draft.trim() || add.isPending) && (
            <Button size="sm" onClick={submit} loading={add.isPending} disabled={!draft.trim()}>
              Comment
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Side-panel version of the comments, with a header and count. */
export function CommentsPanel({ target }: { target: CommentTarget }) {
  const { data: comments } = useComments(target);
  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-4 py-4">
        <MessageSquare className="size-4 text-muted" />
        <h3 className="text-base font-semibold tracking-tight">Comments</h3>
        {!!comments?.length && (
          <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-muted">{comments.length}</span>
        )}
      </div>
      <CommentThread target={target} layout="panel" />
    </>
  );
}
