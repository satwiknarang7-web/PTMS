'use client';

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CalendarDays, Info, MessageSquare, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useLookups } from '@/features/lookups/api';
import { useProject, useProjectMembers } from '@/features/projects/api';
import { appConfig } from '@/shared/config/env';
import { LookupType, OrgRole, StatusCategory } from '@/shared/constants/domain';
import { useSession } from '@/features/auth/api';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useQueryParam } from '@/shared/hooks/use-query-param';
import { errorMessage } from '@/shared/lib/api-client';
import { cn, formatDate, isOverdue } from '@/shared/lib/utils';
import { AvatarGroup } from '@/shared/ui/avatar';
import { ColorBadge } from '@/shared/ui/badge';
import { ErrorState, Spinner } from '@/shared/ui/feedback';
import { useMoveTask, useTasks } from '../api';
import type { Task } from '../types';
import { TaskDetailDrawer } from './task-detail-drawer';
import { EMPTY_TASK_FILTERS, filtersToQuery, TaskFilters } from './task-filters';
import { TaskFormModal } from './task-form-modal';

type Columns = Record<string, Task[]>;

/** Spacing used when a card is dropped at either end of a column. */
const POSITION_GAP = 1024;

function positionBetween(prev?: Task, next?: Task): number {
  if (prev && next) return (prev.position + next.position) / 2;
  if (prev) return prev.position + POSITION_GAP;
  if (next) return next.position - POSITION_GAP;
  return POSITION_GAP;
}

export function TaskBoard({ projectId }: { projectId: string }) {
  const { data: project } = useProject(projectId);
  const { data: members } = useProjectMembers(projectId);
  const { data: statuses } = useLookups(LookupType.TASK_STATUS);
  const [filters, setFilters] = useState(EMPTY_TASK_FILTERS);
  const search = useDebounce(filters.search);
  const [taskId, setTaskId] = useQueryParam('taskId');
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const canEdit = !!project?.access.canEdit && !project.isArchived;
  // Clients see the board only; task details, comments and time stay internal.
  const { data: session } = useSession();
  const clientView = session?.role === OrgRole.VIEWER;
  const move = useMoveTask();

  const { data, isLoading, isError, error, refetch } = useTasks({
    projectId,
    rootOnly: true,
    limit: appConfig.boardPageSize,
    sortBy: 'position',
    ...filtersToQuery({ ...filters, statusId: '' }, search),
  });

  const serverColumns = useMemo<Columns>(() => {
    const columns: Columns = Object.fromEntries(statuses.map((s) => [s.id, [] as Task[]]));
    (data?.data ?? []).forEach((task) => columns[task.statusId]?.push(task));
    Object.values(columns).forEach((list) => list.sort((a, b) => a.position - b.position));
    return columns;
  }, [data, statuses]);

  const [columns, setColumns] = useState<Columns>(serverColumns);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  useEffect(() => setColumns(serverColumns), [serverColumns]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const findColumn = (id: string): string | undefined =>
    id in columns ? id : Object.keys(columns).find((statusId) => columns[statusId].some((task) => task.id === id));

  const onDragStart = ({ active }: DragStartEvent) => {
    const column = findColumn(String(active.id));
    setActiveTask(column ? (columns[column].find((t) => t.id === active.id) ?? null) : null);
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = findColumn(String(active.id));
    const to = findColumn(String(over.id));
    if (!from || !to || from === to) return;
    setColumns((current) => {
      const moving = current[from].find((t) => t.id === active.id);
      if (!moving) return current;
      const target = current[to];
      const overIndex = target.findIndex((t) => t.id === over.id);
      const index = overIndex >= 0 ? overIndex : target.length;
      return {
        ...current,
        [from]: current[from].filter((t) => t.id !== active.id),
        [to]: [...target.slice(0, index), { ...moving, statusId: to }, ...target.slice(index)],
      };
    });
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveTask(null);
    const original = data?.data.find((t) => t.id === active.id);
    const column = findColumn(String(active.id));
    if (!over || !original || !column) return setColumns(serverColumns);

    let list = columns[column];
    const oldIndex = list.findIndex((t) => t.id === active.id);
    const overIndex = list.findIndex((t) => t.id === over.id);
    if (overIndex >= 0 && overIndex !== oldIndex) {
      list = arrayMove(list, oldIndex, overIndex);
      setColumns((current) => ({ ...current, [column]: list }));
    }
    const index = list.findIndex((t) => t.id === active.id);
    const position = positionBetween(list[index - 1], list[index + 1]);
    if (column !== original.statusId || position !== original.position) {
      move.mutate({ id: original.id, statusId: column, position }, { onError: () => setColumns(serverColumns) });
    }
  };

  if (isLoading) return <Spinner />;
  if (isError) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TaskFilters value={filters} onChange={setFilters} members={members?.map((m) => m.user)} hideStatus className="min-w-0 flex-1" />
        <span className="hidden items-center gap-1.5 text-xs text-muted md:inline-flex">
          <Info className="size-3.5" />
          {canEdit ? 'Drag cards between columns to change status' : clientView ? 'Where every task stands' : 'Click a card to see its details'}
        </span>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
        <div className="scrollbar-thin flex gap-4 overflow-x-auto pb-4">
          {statuses.map((status) => (
            <BoardColumn
              key={status.id}
              id={status.id}
              title={status.name}
              color={status.color}
              tasks={columns[status.id] ?? []}
              disabled={!canEdit}
              onOpen={(task) => !clientView && setTaskId(task.id)}
              onAdd={canEdit ? () => setCreatingIn(status.id) : undefined}
            />
          ))}
        </div>
        <DragOverlay>{activeTask ? <TaskCard task={activeTask} dragging /> : null}</DragOverlay>
      </DndContext>
      {!clientView && <TaskFormModal open={!!creatingIn} onClose={() => setCreatingIn(null)} projectId={projectId} defaults={creatingIn ? { statusId: creatingIn } : undefined} />}
      {!clientView && <TaskDetailDrawer taskId={taskId} onClose={() => setTaskId(null)} onOpenTask={setTaskId} />}
    </div>
  );
}

interface ColumnProps {
  id: string;
  title: string;
  color: string;
  tasks: Task[];
  disabled: boolean;
  onOpen: (task: Task) => void;
  onAdd?: () => void;
}

function BoardColumn({ id, title, color, tasks, disabled, onOpen, onAdd }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return (
    <div className="flex w-72 shrink-0 flex-col rounded-ui-lg bg-surface-muted/70">
      <div className="flex items-center justify-between px-3 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
          {title}
          <span className="rounded-full bg-surface px-2 text-xs font-medium text-muted">{tasks.length}</span>
        </div>
        {onAdd && (
          <button type="button" onClick={onAdd} aria-label={`Add task to ${title}`} className="rounded-md p-1 text-muted hover:bg-surface hover:text-foreground">
            <Plus className="size-4" />
          </button>
        )}
      </div>
      <SortableContext id={id} items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy} disabled={disabled}>
        <div ref={setNodeRef} className={cn('flex min-h-32 flex-1 flex-col gap-2 rounded-b-ui-lg px-2 pb-3 transition', isOver && 'bg-brand-soft/60')}>
          {tasks.map((task) => (
            <SortableTaskCard key={task.id} task={task} disabled={disabled} onOpen={onOpen} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableTaskCard({ task, disabled, onOpen }: { task: Task; disabled: boolean; onOpen: (task: Task) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && 'opacity-40')}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(task)}
    >
      <TaskCard task={task} />
    </div>
  );
}

function TaskCard({ task, dragging }: { task: Task; dragging?: boolean }) {
  const closed = task.status.category === StatusCategory.CLOSED;
  const overdue = isOverdue(task.dueDate, closed);
  return (
    <div className={cn('cursor-pointer rounded-ui border border-border bg-surface p-3 shadow-ui-sm transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-ui-md', dragging && 'rotate-2 shadow-ui-lg')}>
      <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
        <span className="font-mono">
          {task.project.key}-{task.number}
        </span>
        <ColorBadge color={task.priority.color} label={task.priority.name} variant="dot" />
      </div>
      <p className={cn('text-sm font-medium', closed && 'text-muted line-through')}>{task.title}</p>
      {task.progress > 0 && !closed && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-muted">
          <div className="h-full bg-brand" style={{ width: `${task.progress}%` }} />
        </div>
      )}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted">
          {task.dueDate && (
            <span className={cn('inline-flex items-center gap-1', overdue && 'font-medium text-danger')}>
              <CalendarDays className="size-3" /> {formatDate(task.dueDate, 'dd MMM')}
            </span>
          )}
          {task._count.comments > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="size-3" /> {task._count.comments}
            </span>
          )}
        </div>
        <AvatarGroup users={task.assignees} />
      </div>
    </div>
  );
}
