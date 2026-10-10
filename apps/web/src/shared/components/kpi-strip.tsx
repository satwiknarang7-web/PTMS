import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

export interface KpiItem {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
  tone?: 'brand' | 'danger' | 'success' | 'warning';
}

const tones = {
  brand: 'text-brand',
  danger: 'text-danger',
  success: 'text-success',
  warning: 'text-warning',
} as const;

const columns = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-4',
} as const;

/**
 * Compact row of key figures in one card: a calmer replacement for a row of
 * big stat cards. Items share dividers instead of each having their own card.
 */
export function KpiStrip({ items, className }: { items: KpiItem[]; className?: string }) {
  const cols = columns[Math.min(Math.max(items.length, 2), 4) as 2 | 3 | 4];
  return (
    <div className={cn('overflow-hidden rounded-ui-lg border border-border bg-surface shadow-ui-sm', className)}>
      {/* The negative margin hides the outer dividers so only inner ones show, whatever the column count. */}
      <dl className={cn('-mb-px -mr-px grid', cols)}>
        {items.map((item) => (
          <div key={item.label} className="min-w-0 border-b border-r border-border px-[var(--card-p)] py-3">
            {/* Narrow columns on phones: the label wraps instead of being cut off. */}
            <dt className="flex items-start gap-1.5 text-xs font-medium leading-snug text-muted sm:items-center">
              {item.icon && <span className={cn('mt-px shrink-0 [&_svg]:size-3.5 sm:mt-0', tones[item.tone ?? 'brand'])}>{item.icon}</span>}
              <span className="min-w-0 break-words sm:truncate">{item.label}</span>
            </dt>
            <dd className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-2">
              <span className="text-xl font-semibold tabular-nums tracking-tight text-foreground">{item.value}</span>
              {item.hint && <span className="max-w-full truncate text-xs text-muted">{item.hint}</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
