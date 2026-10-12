'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/shared/lib/utils';
import { Button } from './button';

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

function useOverlayBehavior(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onCloseRef.current();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);
  return panelRef;
}

function OverlayHeader({ id, title, description, onClose }: { id: string; title: ReactNode; description?: ReactNode; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
      <div className="min-w-0">
        <h2 id={id} className="truncate text-base font-semibold tracking-tight">
          {title}
        </h2>
        {description && <div className="mt-0.5 text-sm text-muted">{description}</div>}
      </div>
      <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close" className="-mr-1.5 -mt-0.5">
        <X />
      </Button>
    </div>
  );
}

const sizes = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' } as const;

export function Modal({ open, onClose, title, description, children, footer, className, size = 'md' }: OverlayProps & { size?: keyof typeof sizes }) {
  const panelRef = useOverlayBehavior(open, onClose);
  const titleId = useId();
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center overflow-y-auto bg-overlay backdrop-blur-[1px] sm:items-start sm:p-4 sm:pt-[10vh]"
      onMouseDown={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        className={cn(
          'flex max-h-[92dvh] w-full animate-pop-in flex-col rounded-t-ui-lg border border-border bg-surface shadow-ui-lg outline-none sm:max-h-[85vh] sm:rounded-ui-lg',
          sizes[size],
          className,
        )}
      >
        <OverlayHeader id={titleId} title={title} description={description} onClose={onClose} />
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-surface-muted/40 px-5 py-3.5 sm:px-6">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ open, onClose, title, description, children, footer, className, aside }: OverlayProps & {
  /** Second column shown to the left of the drawer on large screens (e.g. a comments panel). */
  aside?: ReactNode;
}) {
  const panelRef = useOverlayBehavior(open, onClose);
  const titleId = useId();
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex animate-fade-in justify-end bg-overlay" onMouseDown={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        className="flex h-full w-full animate-slide-in-right justify-end shadow-ui-lg outline-none lg:w-auto"
      >
        {aside && <aside className="hidden h-full w-80 shrink-0 flex-col border-l border-border bg-surface-muted lg:flex xl:w-96">{aside}</aside>}
        <div className={cn('flex h-full w-full max-w-2xl flex-col border-l border-border bg-surface lg:w-[42rem]', className)}>
          <OverlayHeader id={titleId} title={title} description={description} onClose={onClose} />
          <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3.5 sm:px-6">{footer}</div>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', tone = 'danger', loading, onConfirm, onClose, children }: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm text-foreground-soft">
        <p>{message}</p>
        {children}
      </div>
    </Modal>
  );
}
