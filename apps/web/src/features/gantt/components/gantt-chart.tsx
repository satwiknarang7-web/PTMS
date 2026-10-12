'use client';

import { BarChartHorizontal, Diamond, Info } from 'lucide-react';
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useSession } from '@/features/auth/api';
import { OrgRole } from '@/shared/constants/domain';
import { useProject } from '@/features/projects/api';
import { useGantt, useUpdateTask } from '@/features/tasks/api';
import { TaskDetailDrawer } from '@/features/tasks/components/task-detail-drawer';
import type { GanttData } from '@/features/tasks/types';
import { useQueryParam } from '@/shared/hooks/use-query-param';
import { errorMessage } from '@/shared/lib/api-client';
import { cn, formatDate } from '@/shared/lib/utils';
import { AvatarGroup } from '@/shared/ui/avatar';
import { Card } from '@/shared/ui/card';
import { EmptyState, ErrorState, Spinner } from '@/shared/ui/feedback';
import { Segmented } from '@/shared/ui/layout';
import { buildTimeline, dayToDate, dayToIso, GANTT_LAYOUT, GANTT_ZOOM, isWeekend, todayDay, toDay, type GanttZoom } from '../gantt.utils';

type GanttTask = GanttData['tasks'][number];

interface Row {
  kind: 'task' | 'milestone';
  id: string;
  label: string;
  depth: number;
  start: number | null;
  end: number | null;
  color: string;
  progress: number;
  task?: GanttTask;
  completed?: boolean;
}

interface DragState {
  id: string;
  mode: 'move' | 'resize';
  originX: number;
  deltaDays: number;
}

const { rowHeight, barHeight, headerHeight, sidebarWidth, paddingDays } = GANTT_LAYOUT;

/** Orders tasks depth-first so subtasks render under their parent. */
function buildRows(data: GanttData): Row[] {
  const rows: Row[] = data.milestones.map((m) => ({
    kind: 'milestone',
    id: m.id,
    label: m.name,
    depth: 0,
    start: toDay(m.dueDate),
    end: toDay(m.dueDate),
    color: m.completedAt ? 'var(--success)' : 'var(--brand)',
    progress: m.completedAt ? 100 : 0,
    completed: !!m.completedAt,
  }));
  const ids = new Set(data.tasks.map((t) => t.id));
  const children = new Map<string | null, GanttTask[]>();
  data.tasks.forEach((task) => {
    const parent = task.parentId && ids.has(task.parentId) ? task.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), task]);
  });
  const walk = (parentId: string | null, depth: number) => {
    (children.get(parentId) ?? []).forEach((task) => {
      const start = task.startDate ? toDay(task.startDate) : task.dueDate ? toDay(task.dueDate) : null;
      const end = task.dueDate ? toDay(task.dueDate) : start;
      rows.push({ kind: 'task', id: task.id, label: task.title, depth, start, end, color: task.status.color, progress: task.progress, task });
      walk(task.id, depth + 1);
    });
  };
  walk(null, 0);
  return rows;
}

export function GanttChart({ projectId }: { projectId: string }) {
  const { data, isLoading, isError, error, refetch } = useGantt(projectId);
  const { data: project } = useProject(projectId);
  const { data: session } = useSession();
  const weekStartsOn = session?.organization?.weekStartsOn ?? 1;
  const canEdit = !!project?.access.canEdit && !project.isArchived;
  const update = useUpdateTask();
  const [zoom, setZoom] = useState<GanttZoom>('week');
  const [drag, setDrag] = useState<DragState | null>(null);
  const [taskId, setTaskIdParam] = useQueryParam('taskId');
  // Clients see the timeline only; task details stay internal.
  const clientView = session?.role === OrgRole.VIEWER;
  const setTaskId = (id: string | null) => {
    if (!clientView) setTaskIdParam(id);
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const pxPerDay = GANTT_ZOOM[zoom];

  const rows = useMemo(() => (data ? buildRows(data) : []), [data]);

  const range = useMemo(() => {
    const today = todayDay();
    const days = rows.flatMap((r) => [r.start, r.end]).filter((d): d is number => d !== null);
    if (data?.project.startDate) days.push(toDay(data.project.startDate));
    if (data?.project.endDate) days.push(toDay(data.project.endDate));
    days.push(today);
    const start = Math.min(...days) - paddingDays;
    // Snap to the organization's first day of the week so week columns line up with real weeks.
    const offset = (dayToDate(start).getUTCDay() - weekStartsOn + 7) % 7;
    return { start: start - offset, end: Math.max(...days) + paddingDays };
  }, [rows, data, weekStartsOn]);

  const timeline = useMemo(() => buildTimeline(range.start, range.end, zoom), [range, zoom]);
  const totalDays = range.end - range.start + 1;
  const width = totalDays * pxPerDay;
  const x = (day: number) => (day - range.start) * pxPerDay;

  const rowIndex = useMemo(() => new Map(rows.map((row, i) => [row.id, i])), [rows]);

  const adjusted = (row: Row) => {
    if (!drag || drag.id !== row.id || row.start === null || row.end === null) return { start: row.start, end: row.end };
    return drag.mode === 'move'
      ? { start: row.start + drag.deltaDays, end: row.end + drag.deltaDays }
      : { start: row.start, end: Math.max(row.start, row.end + drag.deltaDays) };
  };

  const startDrag = (event: ReactPointerEvent, row: Row, mode: DragState['mode']) => {
    if (!canEdit || row.kind !== 'task') return;
    event.stopPropagation();
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    setDrag({ id: row.id, mode, originX: event.clientX, deltaDays: 0 });
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    if (!drag) return;
    const deltaDays = Math.round((event.clientX - drag.originX) / pxPerDay);
    if (deltaDays !== drag.deltaDays) setDrag({ ...drag, deltaDays });
  };

  const endDrag = (row: Row) => {
    if (!drag || drag.id !== row.id) return;
    const { deltaDays, mode } = drag;
    setDrag(null);
    if (!deltaDays) {
      setTaskId(row.id);
      return;
    }
    const nextStart = mode === 'move' ? row.start! + deltaDays : row.start!;
    const nextEnd = mode === 'move' ? row.end! + deltaDays : Math.max(row.start!, row.end! + deltaDays);
    update.mutate({
      id: row.id,
      ...(row.task?.startDate || mode === 'move' ? { startDate: dayToIso(nextStart) } : {}),
      dueDate: dayToIso(nextEnd),
    });
  };

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;
  if (!rows.length) {
    return (
      <Card>
        <EmptyState icon={<BarChartHorizontal className="size-6" />} title="Nothing to schedule yet" description="Add tasks with start and due dates to see them on the timeline." />
      </Card>
    );
  }

  const today = todayDay();
  const bodyHeight = rows.length * rowHeight;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p
          className="inline-flex items-center gap-1.5 text-xs text-muted"
          title={canEdit ? 'Drag bars to reschedule, drag the right edge to change the due date. Click a bar for details.' : undefined}
        >
          <Info className="size-3.5 shrink-0" />
          {canEdit ? 'Drag bars to reschedule · drag the right edge to change the due date' : 'Timeline of tasks and milestones'}
        </p>
        <Segmented<GanttZoom>
          value={zoom}
          onChange={setZoom}
          options={[
            { value: 'day', label: 'Days' },
            { value: 'week', label: 'Weeks' },
            { value: 'month', label: 'Months' },
          ]}
        />
      </div>
      <Card className="overflow-hidden">
        <div className="flex">
          {/* Sidebar */}
          <div className="shrink-0 border-r border-border bg-surface" style={{ width: sidebarWidth }}>
            <div className="flex items-end border-b border-border px-4 pb-2 text-xs font-semibold uppercase tracking-wide text-muted" style={{ height: headerHeight }}>
              Task
            </div>
            {rows.map((row) => (
              <div
                key={row.id}
                className={cn('flex items-center gap-2 border-b border-border px-4 text-sm', row.kind === 'task' && 'cursor-pointer hover:bg-surface-muted')}
                style={{ height: rowHeight, paddingLeft: 16 + row.depth * 18 }}
                onClick={() => row.kind === 'task' && setTaskId(row.id)}
              >
                {row.kind === 'milestone' ? (
                  <Diamond className="size-3.5 shrink-0 text-brand" fill="currentColor" />
                ) : (
                  <span className="shrink-0 text-xs text-muted">
                    {data.project.key}-{row.task!.number}
                  </span>
                )}
                <span className={cn('min-w-0 flex-1 truncate', row.kind === 'milestone' && 'font-semibold')}>{row.label}</span>
                {row.task && <AvatarGroup users={row.task.assignees} max={2} />}
              </div>
            ))}
          </div>

          {/* Timeline */}
          <div ref={scrollRef} className="scrollbar-thin flex-1 overflow-x-auto" onPointerMove={onPointerMove}>
            <div style={{ width }} className="relative">
              <div className="sticky top-0 z-10 border-b border-border bg-surface" style={{ height: headerHeight }}>
                <div className="flex h-7 border-b border-border">
                  {timeline.months.map((m) => (
                    <div key={m.startDay} className="truncate border-r border-border px-2 text-xs font-semibold leading-7" style={{ width: m.days * pxPerDay }}>
                      {m.label}
                    </div>
                  ))}
                </div>
                <div className="flex h-7">
                  {timeline.units.map((u) => (
                    <div
                      key={u.startDay}
                      className={cn('border-r border-border text-center text-[11px] leading-7 text-muted', u.startDay === today && 'font-bold text-brand')}
                      style={{ width: u.days * pxPerDay }}
                    >
                      {u.label}
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative" style={{ height: bodyHeight }}>
                {/* Grid */}
                {zoom === 'day' &&
                  Array.from({ length: totalDays }, (_, i) => range.start + i)
                    .filter(isWeekend)
                    .map((day) => <div key={day} className="absolute top-0 h-full bg-surface-muted/70" style={{ left: x(day), width: pxPerDay }} />)}
                {rows.map((row, i) => (
                  <div key={row.id} className="absolute left-0 w-full border-b border-border" style={{ top: (i + 1) * rowHeight - 1 }} />
                ))}
                <div className="absolute top-0 z-[1] h-full w-0.5 bg-danger/70" style={{ left: x(today) + pxPerDay / 2 }} title={`Today · ${formatDate(dayToIso(today))}`} />

                {/* Dependency arrows */}
                <svg className="pointer-events-none absolute inset-0 z-[2]" width={width} height={bodyHeight}>
                  <defs>
                    <marker id="gantt-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                      <path d="M0,0 L8,4 L0,8 z" fill="var(--muted)" />
                    </marker>
                  </defs>
                  {data.dependencies.map((dep) => {
                    const fromIndex = rowIndex.get(dep.predecessorId);
                    const toIndex = rowIndex.get(dep.successorId);
                    if (fromIndex === undefined || toIndex === undefined) return null;
                    const from = adjusted(rows[fromIndex]);
                    const to = adjusted(rows[toIndex]);
                    if (from.end === null || to.start === null) return null;
                    const x1 = x(from.end + 1);
                    const y1 = fromIndex * rowHeight + rowHeight / 2;
                    const x2 = x(to.start);
                    const y2 = toIndex * rowHeight + rowHeight / 2;
                    const elbow = Math.max(x1 + 10, x2 - 10);
                    return (
                      <path
                        key={dep.id}
                        d={`M${x1},${y1} H${elbow} V${y2} H${x2 - 2}`}
                        fill="none"
                        stroke="var(--muted)"
                        strokeWidth={1.25}
                        markerEnd="url(#gantt-arrow)"
                        opacity={0.7}
                      />
                    );
                  })}
                </svg>

                {/* Bars */}
                {rows.map((row, i) => {
                  const { start, end } = adjusted(row);
                  if (start === null || end === null) return null;
                  const top = i * rowHeight + (rowHeight - barHeight) / 2;
                  if (row.kind === 'milestone') {
                    return (
                      <div
                        key={row.id}
                        className="absolute z-[3] size-4 rotate-45 rounded-sm shadow-ui-sm"
                        style={{ left: x(start) + pxPerDay / 2 - 8, top: i * rowHeight + rowHeight / 2 - 8, backgroundColor: row.color }}
                        title={`${row.label} · ${formatDate(dayToIso(start))}`}
                      />
                    );
                  }
                  const barWidth = Math.max((end - start + 1) * pxPerDay, 6);
                  return (
                    <div
                      key={row.id}
                      className={cn('group absolute z-[3] select-none overflow-hidden rounded-md shadow-ui-sm', canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer')}
                      style={{ left: x(start), top, width: barWidth, height: barHeight, backgroundColor: `color-mix(in srgb, ${row.color} 28%, var(--surface))` }}
                      title={`${row.label}\n${formatDate(dayToIso(start))} → ${formatDate(dayToIso(end))} · ${row.progress}%`}
                      onPointerDown={(e) => startDrag(e, row, 'move')}
                      onPointerUp={() => endDrag(row)}
                      onClick={() => !canEdit && setTaskId(row.id)}
                    >
                      <div className="h-full" style={{ width: `${row.progress}%`, backgroundColor: row.color }} />
                      {barWidth > 60 && (
                        <span className="absolute inset-0 truncate px-2 text-[11px] font-medium leading-[22px] text-foreground">
                          {row.label}
                        </span>
                      )}
                      {canEdit && (
                        <span
                          className="absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-foreground/15 opacity-0 group-hover:opacity-100"
                          onPointerDown={(e) => startDrag(e, row, 'resize')}
                          onPointerUp={(e) => {
                            e.stopPropagation();
                            endDrag(row);
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </Card>
      {!clientView && <TaskDetailDrawer taskId={taskId} onClose={() => setTaskId(null)} onOpenTask={setTaskId} />}
    </div>
  );
}
