'use client';

import { ImagePlus, Loader2, MessageSquare, MoreHorizontal, Pencil, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { toast } from 'sonner';
import { useSession } from '@/features/auth/api';
import { cn, fullName, timeAgo } from '@/shared/lib/utils';
import { Avatar } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { Dropdown, DropdownItem } from '@/shared/ui/dropdown';
import { Spinner } from '@/shared/ui/feedback';
import { Textarea } from '@/shared/ui/form';
import { Modal } from '@/shared/ui/modal';
import { errorMessage } from '@/shared/lib/api-client';
import {
  commentImageUrl,
  discardCommentImage,
  uploadCommentImage,
  useAddComment,
  useComments,
  useDeleteComment,
  useUpdateComment,
  type CommentImage,
  type CommentTarget,
} from '../api';
import { prepareImage } from '@/shared/lib/image-upload';

const MAX_IMAGES = 6;

/** An image added to the comment being written: uploading, then ready to post. */
interface DraftImage {
  key: string;
  preview: string;
  id?: string;
}

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
  const [images, setImages] = useState<DraftImage[]>([]);
  const [dragging, setDragging] = useState(false);
  const [viewing, setViewing] = useState<CommentImage | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<{ id: string; body: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panel = layout === 'panel';

  // In the side panel the newest comment is at the bottom: keep it in view.
  useEffect(() => {
    if (panel && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [panel, comments?.length]);

  const uploading = images.some((image) => !image.id);
  const canSend = (!!draft.trim() || images.length > 0) && !uploading;

  const addImages = (files: File[]) => {
    const room = MAX_IMAGES - images.length;
    if (files.length > room) toast.error(`You can attach up to ${MAX_IMAGES} images to a comment`);
    for (const file of files.slice(0, Math.max(0, room))) {
      const key = `${Date.now()}-${Math.random()}`;
      setImages((current) => [...current, { key, preview: URL.createObjectURL(file) }]);
      prepareImage(file)
        .then((blob) => uploadCommentImage(target, blob))
        .then((uploaded) => setImages((current) => current.map((image) => (image.key === key ? { ...image, id: uploaded.id } : image))))
        .catch((error: unknown) => {
          toast.error(error instanceof Error && !('status' in error) ? error.message : errorMessage(error));
          removeImage(key, false);
        });
    }
  };

  const removeImage = (key: string, discard = true) =>
    setImages((current) => {
      const image = current.find((item) => item.key === key);
      if (image) {
        URL.revokeObjectURL(image.preview);
        if (discard && image.id) void discardCommentImage(image.id).catch(() => undefined);
      }
      return current.filter((item) => item.key !== key);
    });

  const submit = () => {
    if (!canSend) return;
    add.mutate(
      { body: draft.trim(), attachmentIds: images.map((image) => image.id!) },
      {
        onSuccess: () => {
          setDraft('');
          images.forEach((image) => URL.revokeObjectURL(image.preview));
          setImages([]);
        },
      },
    );
  };

  const imageFiles = (items: Iterable<File>) => [...items].filter((file) => file.type.startsWith('image/'));
  const onPaste = (event: ClipboardEvent) => {
    const files = imageFiles(event.clipboardData.files);
    if (files.length) {
      event.preventDefault();
      addImages(files);
    }
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    addImages(imageFiles(event.dataTransfer.files));
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
                    comment.body && (
                      <p
                        className={cn(
                          'mt-1 whitespace-pre-wrap break-words rounded-ui px-3 py-2 text-sm',
                          panel ? 'border border-border bg-surface' : 'bg-surface-muted',
                        )}
                      >
                        {comment.body}
                      </p>
                    )
                  )}
                  {!!comment.attachments?.length && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {comment.attachments.map((image) => (
                        <button
                          key={image.id}
                          type="button"
                          onClick={() => setViewing(image)}
                          className="overflow-hidden rounded-ui border border-border bg-surface-muted transition hover:opacity-90"
                          aria-label="Open image"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- served by the API with access checks */}
                          <img src={commentImageUrl(image.id)} alt="Attached image" loading="lazy" className="h-28 max-w-[14rem] object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div
        className={cn('flex gap-3', panel && 'border-t border-border bg-surface px-4 py-3')}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        {user && <Avatar user={user} />}
        <div className="min-w-0 flex-1 space-y-2">
          <Textarea
            rows={2}
            placeholder="Write a comment… paste or drop images (Ctrl+Enter to send)"
            value={draft}
            className={cn(dragging && 'ring-2 ring-brand')}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
            }}
          />
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {images.map((image) => (
                <div key={image.key} className="relative size-16 overflow-hidden rounded-ui border border-border bg-surface-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local preview */}
                  <img src={image.preview} alt="" className={cn('size-full object-cover', !image.id && 'opacity-50')} />
                  {!image.id && <Loader2 className="absolute inset-0 m-auto size-5 animate-spin text-foreground" aria-label="Uploading" />}
                  <button
                    type="button"
                    onClick={() => removeImage(image.key)}
                    aria-label="Remove image"
                    className="absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-foreground/70 text-background hover:bg-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              multiple
              hidden
              onChange={(e) => {
                addImages(imageFiles(e.target.files ?? []));
                e.target.value = '';
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => fileInput.current?.click()}
              disabled={images.length >= MAX_IMAGES}
              aria-label="Attach images"
              title="Attach images (or paste / drop them)"
            >
              <ImagePlus className="size-4" /> Image
            </Button>
            {(canSend || add.isPending || uploading) && (
              <Button size="sm" onClick={submit} loading={add.isPending} disabled={!canSend} className="ml-auto">
                {uploading ? 'Uploading…' : 'Comment'}
              </Button>
            )}
          </div>
        </div>
      </div>
      <Modal open={!!viewing} onClose={() => setViewing(null)} title="Image" size="xl">
        {viewing && (
          <div className="space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- served by the API with access checks */}
            <img src={commentImageUrl(viewing.id)} alt="Attached image" className="mx-auto max-h-[70vh] w-auto rounded-ui" />
            <a href={commentImageUrl(viewing.id)} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-brand hover:underline">
              Open full size in a new tab
            </a>
          </div>
        )}
      </Modal>
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
