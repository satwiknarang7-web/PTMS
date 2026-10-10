'use client';

import { Check, ChevronDown, X } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { cn, fullName } from '@/shared/lib/utils';
import type { UserSummary } from '@/shared/types/api';
import { Avatar } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { Dropdown } from '@/shared/ui/dropdown';
import { Input, useFieldId } from '@/shared/ui/form';

interface UserMultiSelectProps {
  options: UserSummary[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function UserMultiSelect({ options, value, onChange, placeholder = 'Select people', disabled }: UserMultiSelectProps) {
  const [search, setSearch] = useState('');
  const fieldId = useFieldId();
  const searchId = useId();
  const selected = options.filter((user) => value.includes(user.id));
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? options.filter((u) => `${fullName(u)} ${u.email}`.toLowerCase().includes(term)) : options;
  }, [options, search]);

  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <Dropdown
      align="left"
      matchTriggerWidth
      className="min-w-64 p-0"
      trigger={({ toggle: toggleOpen }) => (
        <button
          type="button"
          id={fieldId}
          disabled={disabled}
          onClick={toggleOpen}
          className="flex min-h-[var(--control-h)] w-full flex-wrap items-center gap-1.5 rounded-ui border border-border bg-surface px-2 py-1 text-left text-sm shadow-ui-sm focus:border-brand focus:outline-none disabled:opacity-60"
        >
          {selected.length ? (
            selected.map((user) => (
              <span key={user.id} className="inline-flex items-center gap-1 rounded-md bg-surface-muted py-0.5 pl-0.5 pr-1.5 text-xs">
                <Avatar user={user} size="xs" className="ring-0" />
                {fullName(user)}
                <X
                  className="size-3 text-muted hover:text-foreground"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggle(user.id);
                  }}
                />
              </span>
            ))
          ) : (
            <span className="px-1 text-muted/80">{placeholder}</span>
          )}
          <ChevronDown className="ml-auto size-4 text-muted" />
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="border-b border-border p-2">
            <Input id={searchId} aria-label="Search people" autoFocus placeholder="Search people" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="scrollbar-thin max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && <p className="px-3 py-2 text-sm text-muted">No matches</p>}
            {filtered.map((user) => {
              const isSelected = value.includes(user.id);
              return (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => toggle(user.id)}
                  className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface-muted', isSelected && 'bg-brand-soft/50')}
                >
                  <Avatar user={user} size="xs" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{fullName(user)}</span>
                    <span className="block truncate text-xs text-muted">{user.email}</span>
                  </span>
                  {isSelected && <Check className="size-4 text-brand" />}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
            <span className="text-xs text-muted">{value.length ? `${value.length} selected` : 'Nobody selected'}</span>
            <Button size="sm" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      )}
    </Dropdown>
  );
}
