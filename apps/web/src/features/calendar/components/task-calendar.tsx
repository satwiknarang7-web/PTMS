'use client';

import { CalendarX2, ChevronLeft, ChevronRight, Eye, GripVertical, PanelRight, Plus } from 'lucide-react';
import { useMemo, useState, type DragEvent } from 'react';
import { useSession } from '@/features/auth/api';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useMeetings } from '@/features/meetings/api';
import { MeetingChip, MeetingDetailModal, MeetingLegend } from '@/features/meetings/components/meeting-card';
import { MeetingFormModal } from '@/features/meetings/components/meeting-form-modal';
import { localDayKey } from '@/features/meetings/meeting-types';
import type { Meeting } from '@/features/meetings/types';
import { useQuickUpdateTask, useTasks } from '@/features/tasks/api';
import { TaskDetailDrawer } from '@/features/tasks/components/task-detail-drawer';
import type { Task, TaskQuery } from '@/features/tasks/types';
import { appConfig } from '@/shared/config/env';
import { Permission, StatusCategory } from '@/shared/constants/domain';
import { useQueryParam } from '@/shared/hooks/use-query-param';
import { errorMessage } from '@/shared/lib/api-client';
import { cn } from '@/shared/lib/utils';
import { AvatarGroup } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { useCollapsed } from '@/shared/ui/collapsible';
import { Dropdown } from '@/shared/ui/dropdown';
import { Checkbox } from '@/shared/ui/form';
import { ErrorState, Spinner } from '@/shared/ui/feedback';
import { Modal } from '@/shared/ui/modal';
import {
  addDays,
  daysBetween,
  diffDays,
  monthGrid,
  monthLabel,
  shiftMonth,
  taskKey,
  todayKey,
  weekdayLabels,
  type DateKey,
} from '../calendar-dates';

interface TaskCalendarProps {
  /** Which tasks to show (e.g. one project, or `mine`). */
  query: TaskQuery;
  canEdit: boolean;
  /** Show the project key on each item (cross-project calendars). */
  showProject?: boolean;
  /**
   * Show meetings too: `{ projectId }` for a project's meetings plus organization-wide ones,
   * `{}` for every meeting the user can see. Omit to show tasks only.
   */
  meetings?: { projectId?: string };
  /** Remembers the layout (filters, tray) per calendar. */
  storageKey?: string;
  /** Draw tasks across every day from start to due (otherwise on their due date only). */
  defaultSpans?: boolean;
  /** Client (viewer) calendar: client meetings only, no tasks; they may schedule client meetings. */
  clientView?: boolean;
}

const MAX_PER_DAY = 3;
const DRAG_TYPE = 'application/x-task-id';

/** Month calendar of tasks spanning their start → due dates; drag to reschedule. */
export function TaskCalendar({
  query,
  canEdit,
  showProject,
  meetings: meetingScope,
  storageKey = 'calendar',
  defaultSpans = true,
  clientView = false,
}: TaskCalendarProps) {
  const { data: session } = useSession();
  const { can } = usePermissions();
  const weekStartsOn = session?.organization?.weekStartsOn ?? 1;
  const [dateParam] = useQueryParam('date');
  const [month, setMonth] = useState<DateKey>(() =>
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayKey(),
  );
  const [taskId, setTaskId] = useQueryParam('taskId');
  const [expandedDay, setExpandedDay] = useState<DateKey | null>(null);
  const [dropTarget, setDropTarget] = useState<DateKey | null>(null);
  const [openMeeting, setOpenMeeting] = useState<Meeting | null>(null);
  const [scheduling, setScheduling] = useState<DateKey | null>(null);
  const [showTasksSetting, toggleTasks] = useCollapsed(`${storageKey}.tasks`, true);
  const showTasks = showTasksSetting && !clientView;
  const [showMeetings, toggleMeetings] = useCollapsed(`${storageKey}.meetings`, true);
  const [trayOpen, toggleTray] = useCollapsed(`${storageKey}.unscheduled`, false);
  const [spans, toggleSpans] = useCollapsed(`${storageKey}.spans`, defaultSpans);
  const update = useQuickUpdateTask();
  const today = todayKey();
  const withMeetings = !!meetingScope;
  const canSchedule = withMeetings && (clientView || can(Permission.MEETINGS_MANAGE));

  const { data, isLoading, isError, error, refetch } = useTasks(
    { ...query, limit: appConfig.boardPageSize, sortBy: 'dueDate', sortOrder: 'asc' },
    !clientView,
  );
  const tasks = useMemo(() => data?.data ?? [], [data]);
  const days = useMemo(() => monthGrid(month, weekStartsOn), [month, weekStartsOn]);
  const range = useMemo(
    () => ({
      from: new Date(`${days[0]}T00:00:00`).toISOString(),
      to: new Date(`${days[days.length - 1]}T23:59:59`).toISOString(),
    }),
    [days],
  );
  const meetingsQuery = useMeetings({ ...range, projectId: meetingScope?.projectId }, withMeetings);
  const meetingsByDay = useMemo(() => {
    const map = new Map<DateKey, Meeting[]>();
    if (!showMeetings) return map;
    for (const meeting of meetingsQuery.data ?? []) {
      const day = localDayKey(meeting.startsAt);
      map.set(day, [...(map.get(day) ?? []), meeting]);
    }
    return map;
  }, [meetingsQuery.data, showMeetings]);

  const { byDay, unscheduled } = useMemo(() => {
    const map = new Map<DateKey, Task[]>();
    const loose: Task[] = [];
    const visible = new Set(days);
    if (!showTasks) return { byDay: map, unscheduled: loose };
    for (const task of tasks) {
      const start = (spans ? taskKey(task.startDate) : null) ?? taskKey(task.dueDate) ?? taskKey(task.startDate);
      const end = taskKey(task.dueDate) ?? start;
      if (!start || !end) {
        loose.push(task);
        continue;
      }
      for (const day of daysBetween(start, end)) {
        if (!visible.has(day)) continue;
        map.set(day, [...(map.get(day) ?? []), task]);
      }
    }
    return { byDay: map, unscheduled: loose };
  }, [tasks, days, showTasks, spans]);

  /** Moves the task so it ends on `day`, keeping its duration. */
  const reschedule = (task: Task, day: DateKey) => {
    const due = taskKey(task.dueDate);
    const start = taskKey(task.startDate);
    const anchor = due ?? start;
    const delta = anchor ? diffDays(anchor, day) : 0;
    if (anchor && delta === 0) return;
    const nextDue = anchor ? addDays(due ?? anchor, delta) : day;
    const nextStart = start ? addDays(start, delta) : null;
    const input = { dueDate: nextDue, ...(start ? { startDate: nextStart } : {}) };
    update.mutate({
      id: task.id,
      input,
      preview: {
        dueDate: `${nextDue}T00:00:00.000Z`,
        ...(nextStart ? { startDate: `${nextStart}T00:00:00.000Z` } : {}),
      },
    });
  };

  const onDrop = (event: DragEvent, day: DateKey) => {
    event.preventDefault();
    setDropTarget(null);
    const id = event.dataTransfer.getData(DRAG_TYPE);
    const task = tasks.find((t) => t.id === id);
    if (task) reschedule(task, day);
  };

  if (isLoading) return <Spinner />;
  if (isError) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  const itemProps = (task: Task) => ({
    task,
    showProject,
    draggable: canEdit,
    onOpen: () => setTaskId(task.id),
  });

  const dayMeetings = (day: DateKey) => meetingsByDay.get(day) ?? [];
  const showTray = trayOpen && showTasks;

  return (
    <div className="flex flex-col gap-4 xl:flex-row">
      <Card className="min-w-0 flex-1 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="icon"
              aria-label="Previous month"
              onClick={() => setMonth(shiftMonth(month, -1))}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Next month"
              onClick={() => setMonth(shiftMonth(month, 1))}
            >
              <ChevronRight />
            </Button>
            <h2 className="ml-1 text-base font-semibold">{monthLabel(month)}</h2>
            <Button variant="ghost" size="sm" onClick={() => setMonth(today)}>
              Today
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {!clientView && (
              <Dropdown
                trigger={({ toggle, open }) => (
                  <Button variant="secondary" size="sm" onClick={toggle} aria-expanded={open}>
                    <Eye /> Show
                  </Button>
                )}
              >
                {() => (
                  <div className="space-y-2 p-2">
                    {withMeetings && <Checkbox label="Tasks" checked={showTasks} onChange={toggleTasks} />}
                    {withMeetings && <Checkbox label="Meetings" checked={showMeetings} onChange={toggleMeetings} />}
                    <Checkbox
                      label="Tasks across every day they run"
                      checked={spans}
                      disabled={!showTasks}
                      onChange={toggleSpans}
                    />
                  </div>
                )}
              </Dropdown>
            )}
            {showTasks && (
              <Button variant={trayOpen ? 'secondary' : 'ghost'} size="sm" onClick={toggleTray} aria-pressed={trayOpen}>
                <PanelRight /> Unscheduled{unscheduled.length ? ` (${unscheduled.length})` : ''}
              </Button>
            )}
            {canSchedule && (
              <Button size="sm" onClick={() => setScheduling(today)}>
                <Plus /> Meeting
              </Button>
            )}
          </div>
        </div>
        {withMeetings && showMeetings && (
          <div className="border-b border-border px-4 py-2">
            <MeetingLegend />
          </div>
        )}
        <div className="scrollbar-thin overflow-x-auto">
          {/* Phones get a compact month (dots, tap a day for its list); larger screens the full grid. */}
          <div className="sm:min-w-[720px]">
            <div className="grid grid-cols-7 border-b border-border bg-surface-muted/50">
              {weekdayLabels(weekStartsOn).map((label) => (
                <div
                  key={label}
                  className="px-1 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted sm:px-2 sm:text-left"
                >
                  <span className="sm:hidden">{label.slice(0, 1)}</span>
                  <span className="max-sm:hidden">{label}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const items = byDay.get(day) ?? [];
                const meetingsToday = dayMeetings(day);
                const total = items.length + meetingsToday.length;
                const meetingSlots = Math.min(meetingsToday.length, MAX_PER_DAY);
                const taskSlots = MAX_PER_DAY - meetingSlots;
                const inMonth = day.slice(0, 7) === month.slice(0, 7);
                return (
                  <div
                    key={day}
                    onDragOver={(event) => {
                      if (!canEdit) return;
                      event.preventDefault();
                      setDropTarget(day);
                    }}
                    onDragLeave={() => setDropTarget((current) => (current === day ? null : current))}
                    onDrop={(event) => onDrop(event, day)}
                    className={cn(
                      'group/day relative min-h-14 border-b border-r border-border p-1 transition-colors sm:min-h-28 sm:p-1.5 [&:nth-child(7n)]:border-r-0',
                      !inMonth && 'bg-surface-muted/40',
                      dropTarget === day && 'bg-brand-soft',
                    )}
                  >
                    {/* Phones: the whole day is one tap target. */}
                    <button
                      type="button"
                      aria-label={
                        total ? `${total} items on ${day}` : canSchedule ? `Schedule a meeting on ${day}` : day
                      }
                      onClick={() => (total ? setExpandedDay(day) : canSchedule ? setScheduling(day) : undefined)}
                      className="absolute inset-0 sm:hidden"
                    />
                    <div className="mb-1 flex items-center justify-center sm:justify-between">
                      {canSchedule ? (
                        <button
                          type="button"
                          aria-label="Schedule a meeting on this day"
                          title="Schedule a meeting"
                          onClick={() => setScheduling(day)}
                          className="flex size-6 items-center justify-center rounded-full text-muted opacity-0 transition hover:bg-surface-muted hover:text-foreground focus:opacity-100 group-hover/day:opacity-100 max-sm:hidden"
                        >
                          <Plus className="size-3.5" />
                        </button>
                      ) : (
                        <span className="max-sm:hidden" />
                      )}
                      <span
                        className={cn(
                          'flex size-6 items-center justify-center rounded-full text-xs font-medium',
                          day === today ? 'bg-brand text-brand-foreground' : inMonth ? 'text-foreground' : 'text-muted',
                        )}
                      >
                        {Number(day.slice(8))}
                      </span>
                    </div>
                    {total > 0 && (
                      <div className="flex flex-wrap justify-center gap-0.5 sm:hidden" aria-hidden>
                        {meetingsToday.slice(0, 3).map((meeting) => (
                          <span key={meeting.id} className="size-1.5 rounded-full bg-brand" />
                        ))}
                        {items.slice(0, Math.max(0, 3 - Math.min(meetingsToday.length, 3))).map((task) => (
                          <span key={task.id} className="size-1.5 rounded-full bg-foreground-soft" />
                        ))}
                        {total > 3 && <span className="text-[9px] leading-none text-muted">+{total - 3}</span>}
                      </div>
                    )}
                    <div className="space-y-1 max-sm:hidden">
                      {meetingsToday.slice(0, meetingSlots).map((meeting) => (
                        <MeetingChip key={meeting.id} meeting={meeting} onOpen={() => setOpenMeeting(meeting)} />
                      ))}
                      {items.slice(0, taskSlots).map((task) => (
                        <CalendarItem key={task.id} {...itemProps(task)} />
                      ))}
                      {total > MAX_PER_DAY && (
                        <button
                          type="button"
                          onClick={() => setExpandedDay(day)}
                          className="w-full rounded px-1.5 text-left text-xs font-medium text-muted hover:text-foreground"
                        >
                          +{total - MAX_PER_DAY} more
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      {showTray && (
        <Card className="w-full shrink-0 xl:w-72">
          <div className="border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold">Unscheduled</h3>
            <p className="text-xs text-muted">
              {canEdit ? 'Drag an item onto a day to schedule it.' : 'Items without dates.'}
            </p>
          </div>
          <div className="scrollbar-thin max-h-[560px] space-y-1.5 overflow-y-auto p-3">
            {unscheduled.length ? (
              unscheduled.map((task) => <CalendarItem key={task.id} {...itemProps(task)} roomy />)
            ) : (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-xs text-muted">
                <CalendarX2 className="size-5" />
                Everything has a date.
              </div>
            )}
          </div>
        </Card>
      )}

      <Modal
        open={!!expandedDay}
        onClose={() => setExpandedDay(null)}
        title={
          expandedDay
            ? new Date(`${expandedDay}T00:00:00Z`).toLocaleDateString(undefined, { dateStyle: 'full', timeZone: 'UTC' })
            : ''
        }
        size="sm"
      >
        <div className="space-y-1.5">
          {(expandedDay ? dayMeetings(expandedDay) : []).map((meeting) => (
            <MeetingChip
              key={meeting.id}
              meeting={meeting}
              roomy
              onOpen={() => {
                setExpandedDay(null);
                setOpenMeeting(meeting);
              }}
            />
          ))}
          {(expandedDay ? (byDay.get(expandedDay) ?? []) : []).map((task) => (
            <CalendarItem key={task.id} {...itemProps(task)} draggable={false} roomy />
          ))}
        </div>
      </Modal>

      <MeetingDetailModal
        meeting={openMeeting && (meetingsQuery.data?.find((m) => m.id === openMeeting.id) ?? openMeeting)}
        onClose={() => setOpenMeeting(null)}
      />
      {canSchedule && (
        <MeetingFormModal
          open={!!scheduling}
          onClose={() => setScheduling(null)}
          defaultDay={scheduling ?? undefined}
          defaultProjectId={meetingScope?.projectId ?? null}
          clientOnly={clientView}
        />
      )}
      <TaskDetailDrawer taskId={taskId} onClose={() => setTaskId(null)} onOpenTask={setTaskId} />
    </div>
  );
}

interface CalendarItemProps {
  task: Task;
  showProject?: boolean;
  draggable: boolean;
  roomy?: boolean;
  onOpen: () => void;
}

function CalendarItem({ task, showProject, draggable, roomy, onOpen }: CalendarItemProps) {
  const done = task.status.category === StatusCategory.CLOSED;
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, task.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      onClick={onOpen}
      onKeyDown={(event) => event.key === 'Enter' && onOpen()}
      title={`${task.project.key}-${task.number} ${task.title} · ${task.status.name}`}
      className={cn(
        'group flex w-full cursor-pointer items-center gap-1.5 overflow-hidden rounded-md border-l-[3px] bg-surface text-left text-xs shadow-ui-sm transition hover:brightness-[0.98]',
        roomy ? 'px-2 py-1.5' : 'px-1.5 py-1',
        done && 'opacity-60',
      )}
      style={{ borderLeftColor: task.status.color }}
    >
      {draggable && <GripVertical className="size-3 shrink-0 text-muted opacity-0 group-hover:opacity-100" />}
      <span className={cn('min-w-0 flex-1 truncate font-medium', done && 'line-through')}>
        {showProject && <span className="mr-1 text-muted">{task.project.key}</span>}
        {task.title}
      </span>
      {roomy && task.assignees.length > 0 && <AvatarGroup users={task.assignees} max={2} size="xs" />}
    </div>
  );
}
