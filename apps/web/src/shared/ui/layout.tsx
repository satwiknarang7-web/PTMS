'use client';

import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';
import { Button } from './button';
import { Dropdown } from './dropdown';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}

/** Standard page heading used at the top of every screen. */
export function PageHeader({ title, description, actions, breadcrumb }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumb && <div className="mb-1.5 text-xs font-medium text-muted">{breadcrumb}</div>}
        <h1 className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Horizontal toolbar for filters; wraps on small screens. */
export function Toolbar({ children, actions, className }: { children?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between', className)}>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export interface TabItem {
  href: string;
  label: string;
  icon?: ReactNode;
  /** Match the href exactly instead of by prefix. */
  exact?: boolean;
}

export function LinkTabs({ items, className, maxVisible }: { items: TabItem[]; className?: string; /** Tabs beyond this count move into a "More" menu. */ maxVisible?: number }) {
  const pathname = usePathname();
  const isActive = (item: TabItem) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));
  const visible = maxVisible && items.length > maxVisible + 1 ? items.slice(0, maxVisible) : items;
  const overflow = items.slice(visible.length);
  const activeOverflow = overflow.find(isActive);
  return (
    <div className={cn('flex items-center gap-1 border-b border-border', className)}>
      <nav className="scrollbar-none flex min-w-0 gap-0.5 overflow-x-auto overflow-y-hidden [scrollbar-width:none] max-sm:pr-4 max-sm:[mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] sm:gap-1">
        {visible.map((item) => (
          <TabLink key={item.href} item={item} active={isActive(item)} />
        ))}
        {activeOverflow && <TabLink item={activeOverflow} active />}
      </nav>
      {overflow.length > 0 && (
        <Dropdown
          align="left"
          trigger={({ open, toggle }) => (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              className="inline-flex shrink-0 items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium text-muted transition-colors hover:text-foreground sm:px-3"
            >
              More <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
            </button>
          )}
        >
          {(close) =>
            overflow.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={close}
                aria-current={isActive(item) ? 'page' : undefined}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-[calc(var(--radius)-2px)] px-2.5 py-2 text-sm transition-colors [&_svg]:size-4 [&_svg]:text-muted',
                  isActive(item) ? 'bg-surface-muted text-foreground' : 'text-foreground-soft hover:bg-surface-muted hover:text-foreground',
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            ))
          }
        </Dropdown>
      )}
    </div>
  );
}

function TabLink({ item, active }: { item: TabItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative inline-flex shrink-0 items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium transition-colors [&_svg]:size-4 sm:gap-2 sm:px-3',
        active ? 'text-foreground' : 'text-muted hover:text-foreground',
      )}
    >
      {item.icon}
      {item.label}
      <span className={cn('absolute inset-x-2 bottom-0 h-0.5 rounded-full transition-colors', active ? 'bg-brand' : 'bg-transparent')} />
    </Link>
  );
}

/** State-driven underline tabs (same look as LinkTabs) for in-page views. */
export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (value: T) => void; items: { value: T; label: string; icon?: ReactNode }[]; className?: string }) {
  return (
    <div role="tablist" className={cn('scrollbar-none flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border [scrollbar-width:none]', className)}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              'relative inline-flex shrink-0 items-center gap-1.5 px-2.5 py-2.5 text-sm font-medium transition-colors [&_svg]:size-4 sm:gap-2 sm:px-3',
              active ? 'text-foreground' : 'text-muted hover:text-foreground',
            )}
          >
            {item.icon}
            {item.label}
            <span className={cn('absolute inset-x-2 bottom-0 h-0.5 rounded-full transition-colors', active ? 'bg-brand' : 'bg-transparent')} />
          </button>
        );
      })}
    </div>
  );
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
  className?: string;
  'aria-label'?: string;
}

export function Segmented<T extends string>({ value, onChange, options, className, ...rest }: SegmentedProps<T>) {
  return (
    <div role="tablist" aria-label={rest['aria-label']} className={cn('scrollbar-thin inline-flex min-w-0 max-w-full overflow-x-auto rounded-ui border border-border bg-surface-muted p-0.5', className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-[calc(var(--control-h)-0.375rem)] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[calc(var(--radius)-2px)] px-3 text-xs font-medium transition-colors [&_svg]:size-3.5',
              active ? 'bg-surface text-foreground shadow-ui-sm' : 'text-muted hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function ProgressBar({ value, color, className }: { value: number; color?: string; className?: string }) {
  const safe = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-muted', className)} role="progressbar" aria-valuenow={safe} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${safe}%`, ...(color ? { backgroundColor: color } : {}) }} />
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
  tone?: 'brand' | 'danger' | 'success' | 'warning';
}

const statTones = {
  brand: 'bg-brand-soft text-brand',
  danger: 'bg-danger-soft text-danger',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
} as const;

export function StatCard({ label, value, icon, hint, tone = 'brand' }: StatCardProps) {
  return (
    <div className="rounded-ui-lg border border-border bg-surface p-[var(--card-p)] shadow-ui-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        {icon && <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-ui [&_svg]:size-4', statTones[tone])}>{icon}</span>}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-foreground">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-muted">{hint}</p>}
    </div>
  );
}

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  /** Page size; enables the "Displaying X of Y" summary. */
  limit?: number;
  /** Noun used in the summary, e.g. "projects". */
  itemLabel?: string;
  /** Render even when everything fits on one page (for footers that always show the summary). */
  alwaysShow?: boolean;
  className?: string;
}

/** Page numbers to render, with `null` marking an ellipsis gap. */
function pageWindow(page: number, totalPages: number): (number | null)[] {
  const pages = new Set([1, totalPages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= totalPages));
  const sorted = [...pages].sort((a, b) => a - b);
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? [null, p] : [p]));
}

export function Pagination({ page, totalPages, total, onPageChange, limit, itemLabel = 'items', alwaysShow, className }: PaginationProps) {
  if (totalPages <= 1 && !alwaysShow) return null;
  const shown = limit ? Math.max(0, Math.min(limit, total - (page - 1) * limit)) : undefined;
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 border-t border-border px-[var(--card-p)] py-3 text-xs text-muted', className)}>
      <span className="inline-flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-success" aria-hidden />
        {shown !== undefined ? (
          <>
            Displaying <span className="font-medium text-foreground">{shown}</span> of <span className="font-medium text-foreground">{total}</span> {itemLabel}
          </>
        ) : (
          <>
            Page <span className="font-medium text-foreground">{page}</span> of {totalPages} · {total} {itemLabel}
          </>
        )}
      </span>
      {totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-1">
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft /> <span className="hidden sm:inline">Previous</span>
          </Button>
          {pageWindow(page, totalPages).map((p, i) =>
            p === null ? (
              <span key={`gap-${i}`} className="px-1 text-muted">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                aria-current={p === page ? 'page' : undefined}
                onClick={() => onPageChange(p)}
                className={cn(
                  'flex h-8 min-w-8 items-center justify-center rounded-ui px-2 text-xs font-medium tabular-nums transition-colors',
                  p === page ? 'bg-foreground text-background' : 'text-foreground-soft hover:bg-surface-muted',
                )}
              >
                {p}
              </button>
            ),
          )}
          <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            <span className="hidden sm:inline">Next</span> <ChevronRight />
          </Button>
        </nav>
      )}
    </div>
  );
}
