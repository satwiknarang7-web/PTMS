'use client';

import { addDays, differenceInCalendarDays, endOfMonth, endOfWeek, format, isValid, startOfMonth, startOfWeek, subMonths, subWeeks } from 'date-fns';
import { Check, Clock, Pencil, Plus, Receipt, Trash2, Wallet, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSession } from '@/features/auth/api';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useProject } from '@/features/projects/api';
import { appConfig } from '@/shared/config/env';
import { ApprovalStatus, Permission } from '@/shared/constants/domain';
import { errorMessage } from '@/shared/lib/api-client';
import { formatDate, formatMinutes, fullName, humanize, minutesToHours } from '@/shared/lib/utils';
import { Avatar } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { FilterPopover } from '@/shared/components/filter-popover';
import { KpiStrip } from '@/shared/components/kpi-strip';
import { RowMenu } from '@/shared/components/row-menu';
import { Card } from '@/shared/ui/card';
import { ColumnChart } from '@/shared/ui/charts';
import { CollapsibleCard } from '@/shared/ui/collapsible';
import { DropdownItem, DropdownSeparator } from '@/shared/ui/dropdown';
import { EmptyState, ErrorState, Spinner } from '@/shared/ui/feedback';
import { Field, Input, Select } from '@/shared/ui/form';
import { Pagination } from '@/shared/ui/layout';
import { ConfirmDialog } from '@/shared/ui/modal';
import { Table, Td, Th, Tr } from '@/shared/ui/table';
import { useDeleteTimeEntry, useReviewTimeEntry, useTimeEntries, useTimesheetPeople, useTimeSummary } from '../api';
import type { TimeEntry } from '../types';
import { TimeEntryModal } from './time-entry-modal';

type RangePreset = 'this-week' | 'last-week' | 'this-month' | 'last-month' | 'custom';

const RANGE_OPTIONS: { value: RangePreset; label: string }[] = [
  { value: 'this-week', label: 'This week' },
  { value: 'last-week', label: 'Last week' },
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'custom', label: 'Custom range' },
];

const APPROVAL_TONE = {
  [ApprovalStatus.PENDING]: 'warning',
  [ApprovalStatus.APPROVED]: 'success',
  [ApprovalStatus.REJECTED]: 'danger',
} as const;

const iso = (date: Date) => format(date, 'yyyy-MM-dd');

function resolveRange(preset: RangePreset, weekStartsOn: number, custom: { from: string; to: string }) {
  const now = new Date();
  const opts = { weekStartsOn: weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6 };
  switch (preset) {
    case 'this-week':
      return { from: iso(startOfWeek(now, opts)), to: iso(endOfWeek(now, opts)) };
    case 'last-week': {
      const last = subWeeks(now, 1);
      return { from: iso(startOfWeek(last, opts)), to: iso(endOfWeek(last, opts)) };
    }
    case 'this-month':
      return { from: iso(startOfMonth(now)), to: iso(endOfMonth(now)) };
    case 'last-month': {
      const last = subMonths(now, 1);
      return { from: iso(startOfMonth(last)), to: iso(endOfMonth(last)) };
    }
    default:
      return custom;
  }
}

const MAX_CHART_DAYS = 92;

/** One bar per day of the range (empty days included), so gaps in logged time are visible. */
function dailyHours(byDay: { date: string; minutes: number }[], range: { from: string; to: string }) {
  const start = new Date(`${range.from}T00:00:00`);
  const end = new Date(`${range.to}T00:00:00`);
  const days = differenceInCalendarDays(end, start) + 1;
  if (!isValid(start) || !isValid(end) || days < 1 || days > MAX_CHART_DAYS) {
    return byDay.map((d) => ({ day: formatDate(d.date, 'dd MMM'), hours: minutesToHours(d.minutes) }));
  }
  const minutesByDate = new Map(byDay.map((d) => [d.date.slice(0, 10), d.minutes]));
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(start, i);
    return { day: format(date, days <= 7 ? 'EEE d' : 'd MMM'), hours: minutesToHours(minutesByDate.get(iso(date)) ?? 0) };
  });
}

export function TimesheetView({ projectId }: { projectId?: string }) {
  const { data: session } = useSession();
  const { can } = usePermissions();
  const { data: project } = useProject(projectId ?? '');
  const canSeeOthers = can(Permission.TIMESHEETS_VIEW_ALL) || !!project?.access.canManage;
  const canApprove = can(Permission.TIMESHEETS_APPROVE) || !!project?.access.canManage;
  const { data: people } = useTimesheetPeople(projectId, canSeeOthers);

  const [preset, setPreset] = useState<RangePreset>('this-week');
  const [custom, setCustom] = useState({ from: iso(addDays(new Date(), -13)), to: iso(new Date()) });
  const [userId, setUserId] = useState('');
  const [approvalStatus, setApprovalStatus] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<TimeEntry | 'new' | null>(null);
  const [deleting, setDeleting] = useState<TimeEntry | null>(null);
  const review = useReviewTimeEntry();
  const remove = useDeleteTimeEntry();

  const range = useMemo(() => resolveRange(preset, session?.organization?.weekStartsOn ?? 1, custom), [preset, session, custom]);
  const filters = {
    projectId,
    ...range,
    userId: canSeeOthers ? userId || undefined : undefined,
    mine: canSeeOthers ? undefined : true,
    approvalStatus: (approvalStatus || undefined) as ApprovalStatus | undefined,
  };
  const { data, isLoading, isError, error, refetch } = useTimeEntries({ ...filters, page, limit: appConfig.defaultPageSize });
  const { data: summary } = useTimeSummary(filters);

  const chartData = useMemo(() => dailyHours(summary?.byDay ?? [], range), [summary, range]);

  const editable = (entry: TimeEntry) => entry.userId === session?.id && entry.approvalStatus !== ApprovalStatus.APPROVED;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Select
            aria-label="Period"
            className="w-40"
            value={preset}
            onChange={(e) => {
              setPreset(e.target.value as RangePreset);
              setPage(1);
            }}
          >
            {RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          {preset === 'custom' && (
            <div className="flex items-center gap-2">
              <Input aria-label="From" type="date" className="w-40" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
              <span className="text-muted">→</span>
              <Input aria-label="To" type="date" className="w-40" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
            </div>
          )}
          <FilterPopover
            summary={[canSeeOthers && userId ? fullName(people?.find((u) => u.id === userId)) : null, approvalStatus ? humanize(approvalStatus) : null].filter(Boolean).join(' · ') || undefined}
            activeCount={(canSeeOthers && userId ? 1 : 0) + (approvalStatus ? 1 : 0)}
            onReset={() => {
              setUserId('');
              setApprovalStatus('');
              setPage(1);
            }}
          >
            {canSeeOthers && (
              <Field label="Person">
                <Select
                  value={userId}
                  onChange={(e) => {
                    setUserId(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Everyone</option>
                  {people?.map((u) => (
                    <option key={u.id} value={u.id}>
                      {fullName(u)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Approval">
              <Select
                value={approvalStatus}
                onChange={(e) => {
                  setApprovalStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Any approval</option>
                {Object.values(ApprovalStatus).map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </Select>
            </Field>
          </FilterPopover>
        </div>
        <Button onClick={() => setEditing('new')} disabled={!!project && (!project.access.canEdit || project.isArchived)}>
          <Plus className="size-4" /> Log time
        </Button>
      </div>

      <KpiStrip
        items={[
          { label: 'Total logged', value: formatMinutes(summary?.totalMinutes), icon: <Clock />, hint: `${summary?.entries ?? 0} entries` },
          { label: 'Billable', value: formatMinutes(summary?.billableMinutes), icon: <Receipt />, tone: 'success' },
          { label: 'Non-billable', value: formatMinutes((summary?.totalMinutes ?? 0) - (summary?.billableMinutes ?? 0)), icon: <Wallet />, tone: 'warning' },
        ]}
      />

      <CollapsibleCard
        storageKey={projectId ? 'timesheets.project.chart' : 'timesheets.chart'}
        title="Hours per day"
        meta={`${formatDate(range.from)} → ${formatDate(range.to)}`}
        bodyClassName="p-[var(--card-p)]"
      >
        {summary?.totalMinutes ? (
          <ColumnChart data={chartData} xKey="day" series={[{ key: 'hours', label: 'Hours', color: 'var(--brand)' }]} height={200} />
        ) : (
          <EmptyState icon={<Clock className="h-6 w-6" />} title="No time logged in this period" description="Use “Log time” to record the hours you worked." className="py-8" />
        )}
      </CollapsibleCard>

      <Card>
        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <ErrorState message={errorMessage(error)} onRetry={refetch} />
        ) : !data?.data.length ? (
          <EmptyState icon={<Clock className="size-6" />} title="No time logged in this period" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Person</Th>
                  {!projectId && <Th>Project</Th>}
                  <Th>Work item · notes</Th>
                  <Th className="text-right">Duration</Th>
                  <Th>Status</Th>
                  <Th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {data.data.map((entry) => (
                  <Tr key={entry.id}>
                    <Td className="whitespace-nowrap">{formatDate(entry.date)}</Td>
                    <Td>
                      <span className="flex items-center gap-2 whitespace-nowrap">
                        <Avatar user={entry.user} size="xs" /> {fullName(entry.user)}
                      </span>
                    </Td>
                    {!projectId && <Td className="whitespace-nowrap">{entry.project.name}</Td>}
                    <Td className="text-sm">
                      <span className="block max-w-72 truncate">
                        {entry.task ? `${entry.project.key}-${entry.task.number} ${entry.task.title}` : entry.issue ? `${entry.project.key}-BUG-${entry.issue.number} ${entry.issue.title}` : <span className="text-muted">General</span>}
                      </span>
                      {entry.notes && (
                        <span className="block max-w-72 truncate text-xs text-muted" title={entry.notes}>
                          {entry.notes}
                        </span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-right font-medium">
                      {formatMinutes(entry.minutes)}
                      {!entry.isBillable && <span className="block text-xs font-normal text-muted" title="Not billed to the client">Non-billable</span>}
                    </Td>
                    <Td>
                      <Badge tone={APPROVAL_TONE[entry.approvalStatus]}>{humanize(entry.approvalStatus)}</Badge>
                    </Td>
                    <Td className="text-right">
                      <EntryActions
                        canReview={canApprove && entry.userId !== session?.id}
                        status={entry.approvalStatus}
                        editable={editable(entry)}
                        onReview={(status) => review.mutate({ id: entry.id, status })}
                        onEdit={() => setEditing(entry)}
                        onDelete={() => setDeleting(entry)}
                      />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onPageChange={setPage} />
          </>
        )}
      </Card>

      <TimeEntryModal open={!!editing} onClose={() => setEditing(null)} entry={editing && editing !== 'new' ? editing : undefined} projectId={projectId} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete time entry"
        message="This time entry will be permanently removed."
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
      />
    </div>
  );
}

interface EntryActionsProps {
  canReview: boolean;
  status: ApprovalStatus;
  editable: boolean;
  onReview: (status: ApprovalStatus) => void;
  onEdit: () => void;
  onDelete: () => void;
}

/** Row "⋯" menu: approve/reject for reviewers, edit/delete for the owner. */
function EntryActions({ canReview, status, editable, onReview, onEdit, onDelete }: EntryActionsProps) {
  const canApprove = canReview && status !== ApprovalStatus.APPROVED;
  const canReject = canReview && status !== ApprovalStatus.REJECTED;
  if (!canApprove && !canReject && !editable) return null;
  return (
    <RowMenu label="Entry actions">
      {(close) => {
        const run = (action: () => void) => () => {
          close();
          action();
        };
        return (
          <>
            {canApprove && (
              <DropdownItem onClick={run(() => onReview(ApprovalStatus.APPROVED))}>
                <Check className="!text-success" /> Approve
              </DropdownItem>
            )}
            {canReject && (
              <DropdownItem onClick={run(() => onReview(ApprovalStatus.REJECTED))}>
                <X /> Reject
              </DropdownItem>
            )}
            {(canApprove || canReject) && editable && <DropdownSeparator />}
            {editable && (
              <>
                <DropdownItem onClick={run(onEdit)}>
                  <Pencil /> Edit
                </DropdownItem>
                <DropdownItem danger onClick={run(onDelete)}>
                  <Trash2 /> Delete
                </DropdownItem>
              </>
            )}
          </>
        );
      }}
    </RowMenu>
  );
}
