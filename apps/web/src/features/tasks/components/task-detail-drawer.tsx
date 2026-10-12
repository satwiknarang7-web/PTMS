'use client';

import { ChevronDown, Clock, Link2, MoreHorizontal, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { CommentsPanel, CommentThread } from '@/features/comments/components/comment-thread';
import { LookupSelect } from '@/features/lookups/components/lookup-select';
import { useMilestones } from '@/features/milestones/api';
import { useProject, useProjectMembers } from '@/features/projects/api';
import { useTaskLists } from '@/features/task-lists/api';
import { TimeEntryModal } from '@/features/timesheets/components/time-entry-modal';
import { UserMultiSelect } from '@/features/users/components/user-multi-select';
import { appConfig } from '@/shared/config/env';
import { LookupType } from '@/shared/constants/domain';
import { errorMessage } from '@/shared/lib/api-client';
import { cn, formatDateTime, formatMinutes, fullName, toInputDate } from '@/shared/lib/utils';
import { AvatarGroup } from '@/shared/ui/avatar';
import { ColorBadge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Disclosure, useCollapsed } from '@/shared/ui/collapsible';
import { Dropdown, DropdownItem, DropdownSeparator } from '@/shared/ui/dropdown';
import { ErrorState, Spinner } from '@/shared/ui/feedback';
import { Field, Input, Select, Textarea } from '@/shared/ui/form';
import { ProgressBar } from '@/shared/ui/layout';
import { ConfirmDialog, Drawer } from '@/shared/ui/modal';
import { useAddDependency, useDeleteTask, useRemoveDependency, useTask, useTasks, useUpdateTask } from '../api';
import type { TaskDetail, TaskUpdate } from '../types';
import { TaskFormModal } from './task-form-modal';

interface Props {
  taskId: string | null;
  onClose: () => void;
  onOpenTask: (id: string) => void;
}

export function TaskDetailDrawer({ taskId, onClose, onOpenTask }: Props) {
  const { data: task, isLoading, isError, error } = useTask(taskId);
  return (
    <Drawer
      open={!!taskId}
      onClose={onClose}
      title={task ? `${task.project.key}-${task.number}` : 'Task'}
      description={task && <span className="text-muted">{task.project.name}</span>}
      aside={task && <CommentsPanel target={{ taskId: task.id }} />}
    >
      {isLoading ? (
        <Spinner />
      ) : isError || !task ? (
        <ErrorState message={errorMessage(error, 'Task not found')} />
      ) : (
        <TaskDetailBody key={task.id} task={task} onClose={onClose} onOpenTask={onOpenTask} />
      )}
    </Drawer>
  );
}

function TaskDetailBody({ task, onClose, onOpenTask }: { task: TaskDetail; onClose: () => void; onOpenTask: (id: string) => void }) {
  const { data: project } = useProject(task.projectId);
  const canEdit = !!project?.access.canEdit && !project.isArchived;
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const { data: members } = useProjectMembers(task.projectId);
  const { data: taskLists } = useTaskLists(task.projectId);
  const { data: milestones } = useMilestones(task.projectId);
  const memberOptions = useMemo(() => (members ?? []).map((m) => m.user), [members]);

  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [loggingTime, setLoggingTime] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = (patch: TaskUpdate) => update.mutate({ id: task.id, ...patch });
  const [subtasksOpen, toggleSubtasks] = useCollapsed('task-drawer.subtasks', task.subtasks.length > 0);
  const [timeOpen, toggleTime] = useCollapsed('task-drawer.time', false);
  const [commentsOpen, toggleComments] = useCollapsed('task-drawer.comments', true);
  const listName = taskLists?.find((l) => l.id === task.taskListId)?.name;
  const milestoneName = milestones?.find((m) => m.id === task.milestoneId)?.name;
  const detailsSummary = [listName, milestoneName, task.estimatedHours ? `${task.estimatedHours}h` : null, `${task.progress}%`].filter(Boolean).join(' · ');

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-start gap-2">
          <Input
            aria-label="Title"
            disabled={!canEdit}
            className="h-auto min-w-0 flex-1 border-transparent px-0 text-lg font-semibold shadow-none hover:border-border focus:px-3"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== task.title && save({ title: title.trim() })}
          />
          {canEdit && (
            <Dropdown
              trigger={({ open, toggle }) => (
                <Button variant="ghost" size="icon" aria-label="Task actions" aria-expanded={open} onClick={toggle} className="mt-0.5">
                  <MoreHorizontal />
                </Button>
              )}
            >
              {(close) => (
                <>
                  <DropdownItem
                    onClick={() => {
                      close();
                      setAddingSubtask(true);
                    }}
                  >
                    <Plus /> Add subtask
                  </DropdownItem>
                  <DropdownItem
                    onClick={() => {
                      close();
                      setLoggingTime(true);
                    }}
                  >
                    <Clock /> Log time
                  </DropdownItem>
                  <DropdownSeparator />
                  <DropdownItem
                    danger
                    onClick={() => {
                      close();
                      setConfirmDelete(true);
                    }}
                  >
                    <Trash2 /> Delete task
                  </DropdownItem>
                </>
              )}
            </Dropdown>
          )}
        </div>
        {task.parent && (
          <button type="button" onClick={() => onOpenTask(task.parent!.id)} className="block text-xs text-brand hover:underline">
            ↑ Subtask of {task.project.key}-{task.parent.number} {task.parent.title}
          </button>
        )}
        <p className="text-xs text-muted">
          Created by {fullName(task.createdBy)} · {formatDateTime(task.createdAt)}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Status">
          <LookupSelect type={LookupType.TASK_STATUS} disabled={!canEdit} value={task.statusId} onChange={(e) => save({ statusId: e.target.value })} />
        </Field>
        <Field label="Priority">
          <LookupSelect type={LookupType.PRIORITY} disabled={!canEdit} value={task.priorityId} onChange={(e) => save({ priorityId: e.target.value })} />
        </Field>
        <Field label="Assignees" className="sm:col-span-2">
          {canEdit ? (
            <UserMultiSelect options={memberOptions} value={task.assignees.map((a) => a.id)} onChange={(ids) => save({ assigneeIds: ids })} />
          ) : (
            <AvatarGroup users={task.assignees} max={6} size="sm" />
          )}
        </Field>
        <Field label="Start date">
          <Input type="date" disabled={!canEdit} defaultValue={toInputDate(task.startDate)} onBlur={(e) => e.target.value !== toInputDate(task.startDate) && save({ startDate: e.target.value || null })} />
        </Field>
        <Field label="Due date">
          <Input type="date" disabled={!canEdit} defaultValue={toInputDate(task.dueDate)} onBlur={(e) => e.target.value !== toInputDate(task.dueDate) && save({ dueDate: e.target.value || null })} />
        </Field>
      </div>

      <Disclosure
        storageKey="task-drawer.details"
        label={
          <>
            More details <span className="font-normal text-muted">· {detailsSummary}</span>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Task list">
            <Select disabled={!canEdit} value={task.taskListId ?? ''} onChange={(e) => save({ taskListId: e.target.value || null })}>
              <option value="">No list</option>
              {taskLists?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Milestone">
            <Select disabled={!canEdit} value={task.milestoneId ?? ''} onChange={(e) => save({ milestoneId: e.target.value || null })}>
              <option value="">No milestone</option>
              {milestones?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Estimate (hours)">
            <Input
              type="number"
              min={0}
              step="0.5"
              disabled={!canEdit}
              defaultValue={task.estimatedHours ?? ''}
              onBlur={(e) => {
                const value = e.target.value === '' ? null : Number(e.target.value);
                if (value !== task.estimatedHours) save({ estimatedHours: value });
              }}
            />
          </Field>
          <Field label={`Progress · ${task.progress}%`}>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              disabled={!canEdit}
              defaultValue={task.progress}
              className="mt-2 w-full accent-[var(--brand)]"
              onMouseUp={(e) => save({ progress: Number((e.target as HTMLInputElement).value) })}
              onKeyUp={(e) => save({ progress: Number((e.target as HTMLInputElement).value) })}
            />
          </Field>
        </div>
      </Disclosure>

      <Field label="Description">
        <Textarea
          rows={4}
          disabled={!canEdit}
          placeholder="Add more detail…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== (task.description ?? '') && save({ description: description || null })}
        />
      </Field>

      <div className="divide-y divide-border border-y border-border">
        <Section
          title="Subtasks"
          meta={task.subtasks.length}
          open={subtasksOpen}
          onToggle={toggleSubtasks}
          action={
            canEdit && (
              <Button size="sm" variant="ghost" onClick={() => setAddingSubtask(true)}>
                <Plus className="size-3.5" /> Add
              </Button>
            )
          }
        >
          {task.subtasks.length ? (
            <ul className="divide-y divide-border rounded-ui border border-border">
              {task.subtasks.map((sub) => (
                <li key={sub.id}>
                  <button type="button" onClick={() => onOpenTask(sub.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-muted">
                    <span className="text-xs text-muted">
                      {task.project.key}-{sub.number}
                    </span>
                    <span className="flex-1 truncate">{sub.title}</span>
                    <ColorBadge color={sub.status.color} label={sub.status.name} />
                    <AvatarGroup users={sub.assignees} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No subtasks.</p>
          )}
        </Section>

        <DependenciesSection task={task} canEdit={canEdit} onOpenTask={onOpenTask} />

        <Section
          title="Time tracking"
          meta={`${formatMinutes(task.loggedMinutes)}${task.estimatedHours ? ` / ${task.estimatedHours}h` : ''}`}
          open={timeOpen}
          onToggle={toggleTime}
          action={
            canEdit && (
              <Button size="sm" variant="ghost" onClick={() => setLoggingTime(true)}>
                <Clock className="size-3.5" /> Log time
              </Button>
            )
          }
        >
          <div className="flex items-center gap-4 text-sm">
            <span>
              Logged <strong>{formatMinutes(task.loggedMinutes)}</strong>
              {task.estimatedHours ? ` of ${task.estimatedHours}h estimated` : ''}
            </span>
            {task.estimatedHours ? <ProgressBar className="max-w-48" value={(task.loggedMinutes / 60 / task.estimatedHours) * 100} /> : null}
          </div>
        </Section>

        {/* Large screens show the comments in their own panel beside the drawer. */}
        <div className="lg:hidden">
          <Section title="Comments" open={commentsOpen} onToggle={toggleComments}>
            <CommentThread target={{ taskId: task.id }} />
          </Section>
        </div>
      </div>

      <TaskFormModal open={addingSubtask} onClose={() => setAddingSubtask(false)} projectId={task.projectId} defaults={{ parentId: task.id, taskListId: task.taskListId ?? undefined }} />
      <TimeEntryModal open={loggingTime} onClose={() => setLoggingTime(false)} projectId={task.projectId} taskId={task.id} />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete task"
        message={`Delete ${task.project.key}-${task.number} and its ${task.subtasks.length} subtask(s)? This cannot be undone.`}
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => remove.mutate(task.id, { onSuccess: onClose })}
      />
    </div>
  );
}

function DependenciesSection({ task, canEdit, onOpenTask }: { task: TaskDetail; canEdit: boolean; onOpenTask: (id: string) => void }) {
  const [adding, setAdding] = useState(false);
  const [predecessorId, setPredecessorId] = useState('');
  const add = useAddDependency();
  const remove = useRemoveDependency();
  const { data: candidates } = useTasks({ projectId: task.projectId, limit: appConfig.boardPageSize, sortBy: 'number' }, adding);
  const existing = new Set(task.predecessors.map((p) => p.predecessor.id));
  const [open, toggle] = useCollapsed('task-drawer.dependencies', false);
  const count = task.predecessors.length + task.successors.length;

  return (
    <Section
      title="Dependencies"
      meta={count}
      open={open || adding}
      onToggle={() => (adding ? setAdding(false) : toggle())}
      action={
        canEdit &&
        !adding && (
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
            <Link2 className="size-3.5" /> Add blocker
          </Button>
        )
      }
    >
      {adding && (
        <div className="mb-3 flex gap-2">
          <Select value={predecessorId} onChange={(e) => setPredecessorId(e.target.value)}>
            <option value="">This task waits on…</option>
            {candidates?.data
              .filter((t) => t.id !== task.id && !existing.has(t.id))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.project.key}-{t.number} · {t.title}
                </option>
              ))}
          </Select>
          <Button
            disabled={!predecessorId}
            loading={add.isPending}
            onClick={() =>
              add.mutate(
                { taskId: task.id, predecessorId },
                {
                  onSuccess: () => {
                    setAdding(false);
                    setPredecessorId('');
                  },
                },
              )
            }
          >
            Add
          </Button>
          <Button variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <DependencyList
          label="Waiting on"
          items={task.predecessors.map((d) => ({ dependencyId: d.id, task: d.predecessor }))}
          projectKey={task.project.key}
          onOpen={onOpenTask}
          onRemove={canEdit ? (dependencyId) => remove.mutate({ taskId: task.id, dependencyId }) : undefined}
        />
        <DependencyList
          label="Blocking"
          items={task.successors.map((d) => ({ dependencyId: d.id, task: d.successor }))}
          projectKey={task.project.key}
          onOpen={onOpenTask}
          onRemove={canEdit ? (dependencyId) => remove.mutate({ taskId: task.id, dependencyId }) : undefined}
        />
      </div>
    </Section>
  );
}

function DependencyList({
  label,
  items,
  projectKey,
  onOpen,
  onRemove,
}: {
  label: string;
  items: { dependencyId: string; task: TaskDetail['predecessors'][number]['predecessor'] }[];
  projectKey: string;
  onOpen: (id: string) => void;
  onRemove?: (dependencyId: string) => void;
}) {
  return (
    <div className="rounded-ui border border-border p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      {items.length ? (
        <ul className="space-y-1.5">
          {items.map(({ dependencyId, task }) => (
            <li key={dependencyId} className="flex items-center gap-2 text-sm">
              <button type="button" onClick={() => onOpen(task.id)} className="min-w-0 flex-1 truncate text-left hover:text-brand">
                <span className="text-xs text-muted">
                  {projectKey}-{task.number}
                </span>{' '}
                {task.title}
              </button>
              <ColorBadge color={task.status.color} label={task.status.name} variant="dot" />
              {onRemove && (
                <button type="button" aria-label="Remove dependency" onClick={() => onRemove(dependencyId)} className="text-muted hover:text-danger">
                  <X className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">None</p>
      )}
    </div>
  );
}

interface SectionProps {
  title: string;
  /** Short summary shown next to the title, e.g. a count. */
  meta?: ReactNode;
  open: boolean;
  onToggle: () => void;
  action?: ReactNode;
  children: ReactNode;
}

/** Foldable drawer section; its header action stays reachable while it is folded. */
function Section({ title, meta, open, onToggle, action, children }: SectionProps) {
  return (
    <section className="py-3">
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left">
          <ChevronDown className={cn('size-4 shrink-0 text-muted transition-transform', !open && '-rotate-90')} aria-hidden />
          <h3 className="text-sm font-semibold">{title}</h3>
          {meta !== undefined && <span className="rounded-full bg-surface-muted px-1.5 text-xs font-medium tabular-nums text-muted">{meta}</span>}
        </button>
        {action}
      </div>
      {open && <div className="mt-3">{children}</div>}
    </section>
  );
}
