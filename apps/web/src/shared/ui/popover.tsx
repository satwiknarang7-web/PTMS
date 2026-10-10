'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/shared/lib/utils';

const GAP = 6;
const VIEWPORT_MARGIN = 8;

interface PopoverProps {
  /** Renders the trigger; spread `ref` and call `toggle` from it. */
  trigger: (props: { ref: (node: HTMLElement | null) => void; open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
  /** Disables opening (read-only cells). */
  disabled?: boolean;
  /** Makes the panel exactly as wide as the trigger (form pickers). */
  matchTriggerWidth?: boolean;
}

/**
 * Floating panel rendered in a portal, so it is never clipped by scrolling tables.
 * Positions below the trigger (above when there is no room), follows it while
 * scrolling and closes on outside click or Escape.
 */
export function Popover({ trigger, children, align = 'start', className, disabled, matchTriggerWidth }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setPosition(null);
  }, []);
  const toggle = useCallback(() => {
    if (disabled) return;
    setOpen((value) => !value);
  }, [disabled]);

  /** Places the panel below the trigger, or above it when there is no room. */
  const reposition = useCallback(() => {
    if (!triggerRef.current || !panelRef.current) return;
    const anchor = triggerRef.current.getBoundingClientRect();
    const measured = panelRef.current.getBoundingClientRect();
    const panel = matchTriggerWidth ? { width: anchor.width, height: measured.height } : measured;
    const fitsBelow = anchor.bottom + GAP + panel.height <= window.innerHeight - VIEWPORT_MARGIN;
    const top = fitsBelow ? anchor.bottom + GAP : Math.max(VIEWPORT_MARGIN, anchor.top - GAP - panel.height);
    const preferred = align === 'start' ? anchor.left : align === 'end' ? anchor.right - panel.width : anchor.left + (anchor.width - panel.width) / 2;
    const left = Math.min(Math.max(VIEWPORT_MARGIN, preferred), window.innerWidth - panel.width - VIEWPORT_MARGIN);
    setPosition({ top, left, width: anchor.width });
  }, [align, matchTriggerWidth]);

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) close();
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close();
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    // Follow the trigger while the page or a scrolling table moves underneath.
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, close, reposition]);

  return (
    <>
      {trigger({
        ref: (node) => {
          triggerRef.current = node;
        },
        open,
        toggle,
      })}
      {open &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            style={{
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              width: matchTriggerWidth && position ? position.width : undefined,
              visibility: position ? 'visible' : 'hidden',
            }}
            className={cn('fixed z-50 animate-pop-in rounded-ui-lg border border-border bg-surface p-2 shadow-ui-lg', className)}
          >
            {children(close)}
          </div>,
          document.body,
        )}
    </>
  );
}
