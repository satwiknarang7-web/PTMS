'use client';

import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { Popover } from './popover';

interface DropdownProps {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  className?: string;
  /** Panel as wide as the trigger, which then fills its container (form pickers). */
  matchTriggerWidth?: boolean;
}

/**
 * Accessible menu that closes on outside click / Escape. Rendered in a portal (see Popover),
 * so scrolling tables and cards with hidden overflow never cut it off.
 */
export function Dropdown({ trigger, children, align = 'right', className, matchTriggerWidth }: DropdownProps) {
  return (
    <Popover
      align={align === 'right' ? 'end' : 'start'}
      matchTriggerWidth={matchTriggerWidth}
      className={cn('min-w-52 max-w-[calc(100vw-1.5rem)] overflow-hidden p-1', className)}
      trigger={({ ref, open, toggle }) => (
        <span ref={ref} className={matchTriggerWidth ? 'flex w-full' : 'inline-flex'}>
          {trigger({ open, toggle })}
        </span>
      )}
    >
      {(close) => <div role="menu">{children(close)}</div>}
    </Popover>
  );
}

export function DropdownItem({ onClick, children, danger }: { onClick: () => void; children: ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-[calc(var(--radius)-2px)] px-2.5 py-2 text-left text-sm transition-colors [&_svg]:size-4 [&_svg]:text-muted',
        danger ? 'text-danger hover:bg-danger-soft [&_svg]:text-danger' : 'text-foreground-soft hover:bg-surface-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

export function DropdownSeparator() {
  return <div className="-mx-1 my-1 h-px bg-border" />;
}
