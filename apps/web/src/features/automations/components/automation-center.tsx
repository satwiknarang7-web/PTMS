'use client';

import { ChevronDown, MoreHorizontal, Pencil, Plus, Trash2, Zap } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLookups } from '@/features/lookups/api';
import { useProject, useProjectMembers } from '@/features/projects/api';
import { useTaskLists } from '@/features/task-lists/api';
import { LookupType, StatusCategory } from '@/shared/constants/domain';
import { errorMessage } from '@/shared/lib/api-client';
import { cn, fullName, timeAgo } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Card, CardHeader } from '@/shared/ui/card';
import { Dropdown, DropdownItem, DropdownSeparator } from '@/shared/ui/dropdown';
import { EmptyState, ErrorState, Spinner } from '@/shared/ui/feedback';
import { Field, Input, Select } from '@/shared/ui/form';
import { ConfirmDialog, Modal } from '@/shared/ui/modal';
import { Switch } from '@/shared/ui/switch';
import { useAutomations, useDeleteAutomation, useSaveAutomation, useToggleAutomation } from '../api';
import { ACTIONS, TRIGGERS, type Automation, type AutomationAction, type AutomationInput, type AutomationTrigger, type AutomationValueKind } from '../types';

interface Option {
  id: string;
  name: string;
  color?: string | null;
}

type Options = Record<Exclude<AutomationValueKind, 'days' | null>, Option[]>;

/** Builds the lists the rule builder picks values from. */
function useAutomationOptions(projectId: string): Options {
  const { data: statuses } = useLookups(LookupType.TASK_STATUS);
  const { data: priorities } = useLookups(LookupType.PRIORITY);
  const { data: members } = useProjectMembers(projectId);
  const { data: groups } = useTaskLists(projectId);
  return useMemo(
    () => ({
      status: statuses.map((s) => ({ id: s.id, name: s.name, color: s.color })),
      priority: priorities.map((p) => ({ id: p.id, name: p.name, color: p.color })),
      user: (members ?? []).filter((m) => m.user.isActive).map((m) => ({ id: m.userId, name: fullName(m.user) })),
      group: (groups ?? []).map((g) => ({ id: g.id, name: g.name, color: g.color })),
    }),
    [statuses, priorities, members, groups],
  );
}

function valueName(kind: AutomationValueKind, value: string | null, options: Options): string | null {
  if (!kind || !value) return null;
  if (kind === 'days') return `${value} day${value === '1' ? '' : 's'}`;
  return options[kind].find((o) => o.id === value)?.name ?? 'a removed value';
}

function Chip({ children, tone = 'brand' }: { children: ReactNode; tone?: 'brand' | 'neutral' }) {
  return (
    <span className={cn('rounded-md px-1.5 py-0.5 font-semibold', tone === 'brand' ? 'bg-brand-soft text-brand' : 'bg-surface-muted text-foreground')}>{children}</span>
  );
}

/** "When status changes to Done, notify the item creator" */
function Sentence({ rule, options }: { rule: Pick<AutomationInput, 'trigger' | 'triggerValue' | 'action' | 'actionValue'>; options: Options }) {
  const trigger = TRIGGERS[rule.trigger];
  const action = ACTIONS[rule.action];
  const triggerValue = trigger.value ? (valueName(trigger.value, rule.triggerValue, options) ?? trigger.valueLabel) : null;
  const actionValue = valueName(action.value, rule.actionValue, options);
  return (
    <p className="text-sm leading-7 text-foreground-soft">
      <span className="font-semibold text-foreground">When</span> {trigger.label}
      {triggerValue && (
        <>
          {' '}
          <Chip tone="neutral">{triggerValue}</Chip>
        </>
      )}
      <span className="font-semibold text-foreground">, then</span> {action.label}
      {actionValue && (
        <>
          {' '}
          <Chip>{actionValue}</Chip>
        </>
      )}
    </p>
  );
}

const RECIPES: { title: string; build: (options: Options) => Partial<AutomationInput> }[] = [
  {
    title: 'When an item is done, notify its creator',
    build: () => ({ trigger: 'STATUS_CHANGED', action: 'NOTIFY_CREATOR' }),
  },
  {
    title: 'When an item is created, give it a due date one week out',
    build: () => ({ trigger: 'ITEM_CREATED', action: 'SET_DUE_IN_DAYS', actionValue: '7' }),
  },
  {
    title: 'When priority becomes critical, notify a teammate',
    build: (options) => ({ trigger: 'PRIORITY_CHANGED', triggerValue: options.priority.at(-1)?.id ?? null, action: 'NOTIFY_USER' }),
  },
  {
    title: 'When an item is done, move it to another group',
    build: () => ({ trigger: 'STATUS_CHANGED', action: 'MOVE_TO_GROUP' }),
  },
];

export function AutomationCenter({ projectId }: { projectId: string }) {
  const { data: project } = useProject(projectId);
  const canManage = !!project?.access.canManage && !project.isArchived;
  const { data, isLoading, isError, error, refetch } = useAutomations(projectId);
  const options = useAutomationOptions(projectId);
  const { data: statuses } = useLookups(LookupType.TASK_STATUS);
  const toggle = useToggleAutomation(projectId);
  const remove = useDeleteAutomation(projectId);
  const [editing, setEditing] = useState<Partial<AutomationInput> & { id?: string } | null>(null);
  const [deleting, setDeleting] = useState<Automation | null>(null);

  const doneStatus = statuses.find((s) => s.category === StatusCategory.CLOSED)?.id ?? null;
  const startRecipe = (recipe: (typeof RECIPES)[number]) => {
    const draft = recipe.build(options);
    // Recipes about finishing work start from the organization's closed status.
    if (draft.trigger === 'STATUS_CHANGED' && draft.triggerValue === undefined) draft.triggerValue = doneStatus;
    setEditing(draft);
  };

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          icon={<Zap />}
          title="Automations"
          description="Rules that run on this project's items so routine updates happen by themselves."
          actions={
            canManage && (
              <Dropdown
                className="w-80"
                trigger={({ open, toggle }) => (
                  <Button size="sm" onClick={toggle} aria-expanded={open}>
                    <Plus /> New automation <ChevronDown className={cn('transition-transform', open && 'rotate-180')} />
                  </Button>
                )}
              >
                {(close) => (
                  <>
                    <DropdownItem
                      onClick={() => {
                        close();
                        setEditing({});
                      }}
                    >
                      <Plus /> Blank automation
                    </DropdownItem>
                    <DropdownSeparator />
                    <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Start from a recipe</p>
                    {RECIPES.map((recipe) => (
                      <DropdownItem
                        key={recipe.title}
                        onClick={() => {
                          close();
                          startRecipe(recipe);
                        }}
                      >
                        <Zap className="!text-brand" /> {recipe.title}
                      </DropdownItem>
                    ))}
                  </>
                )}
              </Dropdown>
            )
          }
        />
        {data.length === 0 ? (
          <>
            <EmptyState
              icon={<Zap className="size-6" />}
              title="No automations yet"
              description={canManage ? 'Start from a recipe or build your own rule.' : 'Project managers can add automations here.'}
            />
            {canManage && (
              <div className="mx-auto grid max-w-3xl gap-2 px-[var(--card-p)] pb-[var(--card-p)] sm:grid-cols-2">
                {RECIPES.map((recipe) => (
                  <button
                    key={recipe.title}
                    type="button"
                    onClick={() => startRecipe(recipe)}
                    className="flex w-full items-start gap-2.5 rounded-ui border border-border bg-surface px-3 py-2.5 text-left text-sm shadow-ui-sm transition hover:border-brand hover:bg-brand-soft"
                  >
                    <Zap className="mt-0.5 size-4 shrink-0 text-brand" />
                    {recipe.title}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <ul className="divide-y divide-border">
            {data.map((automation) => (
              <li key={automation.id} className={cn('flex items-start gap-3 px-[var(--card-p)] py-3.5 sm:items-center', !automation.isActive && 'opacity-60')}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{automation.name}</p>
                  <Sentence rule={automation} options={options} />
                  <p className="text-xs text-muted">
                    Ran {automation.runCount} time{automation.runCount === 1 ? '' : 's'}
                    {automation.lastRunAt && ` · last ${timeAgo(automation.lastRunAt)}`} · by {fullName(automation.createdBy)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Switch
                    checked={automation.isActive}
                    disabled={!canManage || toggle.isPending}
                    label={automation.isActive ? 'Turn off' : 'Turn on'}
                    onChange={(isActive) => toggle.mutate({ id: automation.id, isActive })}
                  />
                  {canManage && (
                    <Dropdown
                      trigger={({ open, toggle: toggleMenu }) => (
                        <Button variant="ghost" size="icon" aria-label="Automation actions" aria-expanded={open} onClick={toggleMenu}>
                          <MoreHorizontal />
                        </Button>
                      )}
                    >
                      {(close) => (
                        <>
                          <DropdownItem
                            onClick={() => {
                              close();
                              setEditing(automation);
                            }}
                          >
                            <Pencil /> Edit automation
                          </DropdownItem>
                          <DropdownSeparator />
                          <DropdownItem
                            danger
                            onClick={() => {
                              close();
                              setDeleting(automation);
                            }}
                          >
                            <Trash2 /> Delete automation
                          </DropdownItem>
                        </>
                      )}
                    </Dropdown>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <AutomationModal projectId={projectId} draft={editing} options={options} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!deleting}
        title="Delete automation?"
        message={`“${deleting?.name}” will stop running. This cannot be undone.`}
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

interface ModalProps {
  projectId: string;
  draft: (Partial<AutomationInput> & { id?: string }) | null;
  options: Options;
  onClose: () => void;
}

function AutomationModal({ projectId, draft, options, onClose }: ModalProps) {
  const save = useSaveAutomation(projectId);
  const [trigger, setTrigger] = useState<AutomationTrigger>('STATUS_CHANGED');
  const [triggerValue, setTriggerValue] = useState('');
  const [action, setAction] = useState<AutomationAction>('NOTIFY_ASSIGNEES');
  const [actionValue, setActionValue] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!draft) return;
    setTrigger(draft.trigger ?? 'STATUS_CHANGED');
    setTriggerValue(draft.triggerValue ?? '');
    setAction(draft.action ?? 'NOTIFY_ASSIGNEES');
    setActionValue(draft.actionValue ?? '');
    setName(draft.name ?? '');
    setError(null);
  }, [draft]);

  const triggerKind = TRIGGERS[trigger].value;
  const actionKind = ACTIONS[action].value;
  const rule = { trigger, triggerValue: triggerValue || null, action, actionValue: actionValue || null };

  const autoName = () => {
    const tv = triggerKind ? valueName(triggerKind, rule.triggerValue, options) : null;
    const av = valueName(actionKind, rule.actionValue, options);
    return `When ${TRIGGERS[trigger].label}${tv ? ` ${tv}` : ''}, ${ACTIONS[action].label}${av ? ` ${av}` : ''}`.slice(0, 120);
  };

  const submit = () => {
    if (actionKind && !actionValue) return setError('Choose a value for the action.');
    save.mutate({ id: draft?.id, ...rule, name: name.trim() || autoName() }, { onSuccess: onClose });
  };

  const valuePicker = (kind: AutomationValueKind, value: string, onChange: (v: string) => void, anyLabel?: string) => {
    if (!kind) return null;
    if (kind === 'days') {
      return <Input type="number" min={0} max={365} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Days from today" className="w-28" />;
    }
    return (
      <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Value">
        <option value="">{anyLabel ?? 'Choose…'}</option>
        {options[kind].map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </Select>
    );
  };

  return (
    <Modal
      open={!!draft}
      onClose={onClose}
      title={draft?.id ? 'Edit automation' : 'New automation'}
      description="Build the rule as a sentence: when something happens, then do something."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            Save automation
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="rounded-ui-lg border border-border bg-surface-muted/50 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">When</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Select
              value={trigger}
              aria-label="Trigger"
              onChange={(e) => {
                setTrigger(e.target.value as AutomationTrigger);
                setTriggerValue('');
              }}
            >
              {Object.entries(TRIGGERS).map(([value, t]) => (
                <option key={value} value={value}>
                  {t.label}
                </option>
              ))}
            </Select>
            {valuePicker(triggerKind, triggerValue, setTriggerValue, TRIGGERS[trigger].valueLabel || undefined)}
          </div>
          <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Then</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Select
              value={action}
              aria-label="Action"
              onChange={(e) => {
                setAction(e.target.value as AutomationAction);
                setActionValue('');
                setError(null);
              }}
            >
              {Object.entries(ACTIONS).map(([value, a]) => (
                <option key={value} value={value}>
                  {a.label}
                </option>
              ))}
            </Select>
            {valuePicker(actionKind, actionValue, (v) => {
              setActionValue(v);
              setError(null);
            })}
          </div>
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
        </div>
        <div className="rounded-ui-lg border border-dashed border-border px-4 py-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Preview</p>
          <Sentence rule={rule} options={options} />
        </div>
        <Field label="Name" hint="Optional. Defaults to the rule sentence.">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder={autoName()} />
        </Field>
      </div>
    </Modal>
  );
}
