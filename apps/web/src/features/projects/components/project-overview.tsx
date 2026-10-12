'use client';

import {
  Activity,
  AlertTriangle,
  Bug,
  CheckCircle2,
  Clock,
  Flag,
  ListTodo,
  PieChart,
  Users,
  Wallet,
  BarChart3,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { ActivityFeed } from '@/features/activity/components/activity-feed';
import { useSession } from '@/features/auth/api';
import { OrgRole } from '@/shared/constants/domain';
import { errorMessage } from '@/shared/lib/api-client';
import { cn, formatDate, formatMinutes, formatShortDate, fullName, minutesToHours } from '@/shared/lib/utils';
import { Avatar } from '@/shared/ui/avatar';
import { Card } from '@/shared/ui/card';
import { BarList, DonutChart } from '@/shared/ui/charts';
import { CollapsibleCard, Disclosure } from '@/shared/ui/collapsible';
import { ErrorState, Spinner } from '@/shared/ui/feedback';
import { ProgressBar } from '@/shared/ui/layout';
import { useProject, useProjectDashboard } from '../api';

/** Members listed in the workload card before the rest fold behind "Show more". */
const WORKLOAD_SHOWN = 5;

export function ProjectOverview({ projectId }: { projectId: string }) {
  const { data: project } = useProject(projectId);
  const { data, isLoading, isError, error, refetch } = useProjectDashboard(projectId);
  const { data: session } = useSession();
  // Clients see progress, budget and milestones; the team's workload and activity stay internal.
  const clientView = session?.role === OrgRole.VIEWER;

  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  const budgetMinutes = (data.project.budgetHours ?? 0) * 60;
  const budgetUsed = budgetMinutes ? Math.round((data.loggedMinutes / budgetMinutes) * 100) : 0;
  const openIssues = data.issuesBySeverity.reduce((sum, row) => sum + row.count, 0);
  const openByPriority = data.tasksByPriority.reduce((sum, row) => sum + row.count, 0);
  const maxWorkload = Math.max(...data.workload.map((w) => w.openTasks), 1);
  const workloadRow = (row: (typeof data.workload)[number]) => (
    <div key={row.user.id} className="flex items-center gap-3">
      <Avatar user={row.user} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex justify-between gap-2 text-sm">
          <span className="truncate font-medium">{fullName(row.user)}</span>
          <span className="shrink-0 text-xs text-muted">
            {row.openTasks} open
            {row.overdueTasks ? <span className="text-danger"> · {row.overdueTasks} overdue</span> : null}
          </span>
        </div>
        <ProgressBar value={(row.openTasks / maxWorkload) * 100} />
      </div>
    </div>
  );
  // Busiest members first so the folded tail holds the least loaded ones.
  const workload = [...data.workload].sort((a, b) => b.openTasks - a.openTasks);

  return (
    <div className="space-y-5">
      {/* Compact KPI strip */}
      <Card className="grid grid-cols-2 overflow-hidden lg:grid-cols-4 lg:divide-x lg:divide-border [&>*:nth-child(-n+2)]:max-lg:border-b [&>*:nth-child(odd)]:max-lg:border-r">
        <Kpi
          label="Open tasks"
          value={data.stats.openTasks}
          hint={`${data.stats.totalTasks} total`}
          icon={<ListTodo />}
          tone="bg-brand-soft text-brand"
        />
        <Kpi
          label="Completed"
          value={data.stats.completedTasks}
          hint={`${data.stats.progress}% done`}
          icon={<CheckCircle2 />}
          tone="bg-success-soft text-success"
        />
        <Kpi
          label="Overdue"
          value={data.stats.overdueTasks}
          icon={<AlertTriangle />}
          tone="bg-danger-soft text-danger"
          danger={data.stats.overdueTasks > 0}
        />
        {clientView ? (
          <Kpi
            label="Target date"
            value={data.project.endDate ? formatShortDate(data.project.endDate) : '—'}
            hint={project ? `Owner: ${fullName(project.owner)}` : undefined}
            icon={<Flag />}
            tone="bg-warning-soft text-warning"
          />
        ) : (
          <Kpi
            label="Time logged"
            value={formatMinutes(data.loggedMinutes)}
            hint={`${formatMinutes(data.billableMinutes)} billable`}
            icon={<Clock />}
            tone="bg-warning-soft text-warning"
          />
        )}
      </Card>

      <div className="grid gap-5 xl:grid-cols-3">
        <CollapsibleCard
          className="xl:col-span-2"
          title="Tasks by status"
          icon={<PieChart />}
          meta={`${data.stats.totalTasks} tasks`}
          storageKey="project-overview.status"
          bodyClassName="p-[var(--card-p)]"
        >
          <DonutChart data={data.tasksByStatus} emptyLabel="No tasks yet" />
        </CollapsibleCard>
        <CollapsibleCard
          title="Open tasks by priority"
          icon={<BarChart3 />}
          meta={openByPriority}
          storageKey="project-overview.priority"
          bodyClassName="p-[var(--card-p)]"
        >
          <BarList data={data.tasksByPriority} emptyLabel="No open tasks" />
        </CollapsibleCard>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-3">
        <CollapsibleCard
          title="Milestones"
          icon={<Flag />}
          meta={
            data.milestones.next
              ? `Next: ${formatShortDate(data.milestones.next.dueDate)}`
              : `${data.milestones.completed}/${data.milestones.total} done`
          }
          storageKey="project-overview.milestones"
          bodyClassName="space-y-3 p-[var(--card-p)]"
        >
          <div className="grid grid-cols-3 gap-2 text-center">
            <Metric label="Total" value={data.milestones.total} />
            <Metric label="Done" value={data.milestones.completed} />
            <Metric label="Overdue" value={data.milestones.overdue} danger={data.milestones.overdue > 0} />
          </div>
          {data.milestones.next ? (
            <div className="flex items-center gap-3 rounded-ui bg-surface-muted p-3 text-sm">
              <Flag className="size-4 shrink-0 text-brand" />
              <div className="min-w-0">
                <p className="truncate font-medium">{data.milestones.next.name}</p>
                <p className="text-xs text-muted">Next milestone · due {formatDate(data.milestones.next.dueDate)}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">No upcoming milestones.</p>
          )}
        </CollapsibleCard>

        {!clientView && (
        <CollapsibleCard
          title="Budget"
          icon={<Wallet />}
          meta={data.project.budgetHours ? `${budgetUsed}% of ${data.project.budgetHours}h` : 'No budget set'}
          storageKey="project-overview.budget"
          bodyClassName="space-y-3 p-[var(--card-p)]"
        >
          <div>
            <div className="mb-1.5 flex justify-between text-sm">
              <span className="text-muted">Logged</span>
              <span className="font-medium">
                {minutesToHours(data.loggedMinutes)}h {budgetMinutes ? `(${budgetUsed}%)` : ''}
              </span>
            </div>
            <ProgressBar
              value={budgetUsed}
              color={budgetUsed > 100 ? 'var(--danger)' : budgetUsed > 90 ? 'var(--warning)' : undefined}
            />
          </div>
          <Row label="Budgeted">{data.project.budgetHours ? `${data.project.budgetHours}h` : '—'}</Row>
          <Row label="Estimated effort">{data.estimatedHours}h</Row>
          <Row label="Owner">
            {project && (
              <span className="flex items-center gap-2">
                <Avatar user={project.owner} size="xs" /> {fullName(project.owner)}
              </span>
            )}
          </Row>
        </CollapsibleCard>
        )}

        <CollapsibleCard
          title="Open issues by severity"
          icon={<Bug />}
          meta={openIssues}
          storageKey="project-overview.issues"
          bodyClassName="p-[var(--card-p)]"
        >
          <BarList data={data.issuesBySeverity} emptyLabel="No open issues" />
        </CollapsibleCard>
      </div>

      {clientView && (
        <CollapsibleCard title="Updates" icon={<Activity />} storageKey="project-overview.updates" bodyClassName="p-[var(--card-p)]">
          <ActivityFeed projectId={projectId} pageSize={10} paginated={false} />
        </CollapsibleCard>
      )}

      {!clientView && (
        <div className="grid items-start gap-5 xl:grid-cols-3">
          <CollapsibleCard
            className="xl:col-span-2"
            title="Team workload"
            description="Open tasks per member"
            icon={<Users />}
            meta={`${data.workload.length} members`}
            storageKey="project-overview.workload"
            bodyClassName="space-y-3 p-[var(--card-p)]"
          >
            {workload.slice(0, WORKLOAD_SHOWN).map(workloadRow)}
            {workload.length > WORKLOAD_SHOWN && (
              <Disclosure label={`Show ${workload.length - WORKLOAD_SHOWN} more`}>
                <div className="space-y-3">{workload.slice(WORKLOAD_SHOWN).map(workloadRow)}</div>
              </Disclosure>
            )}
          </CollapsibleCard>
          <CollapsibleCard
            title="Recent activity"
            icon={<Activity />}
            storageKey="project-overview.activity"
            bodyClassName="p-[var(--card-p)]"
          >
            <ActivityFeed projectId={projectId} pageSize={6} paginated={false} />
          </CollapsibleCard>
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  icon,
  tone,
  danger,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon: ReactNode;
  tone: string;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 border-border px-4 py-3">
      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-ui [&_svg]:size-4', tone)}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="flex items-baseline gap-2">
          <span className={cn('text-lg font-semibold tabular-nums leading-tight', danger && 'text-danger')}>
            {value}
          </span>
          {hint && <span className="truncate text-xs text-muted">{hint}</span>}
        </p>
        <p className="truncate text-xs text-muted">{label}</p>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="min-w-0 truncate font-medium">{children}</span>
    </div>
  );
}

function Metric({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-ui bg-surface-muted py-2">
      <p className={cn('text-lg font-semibold', danger && 'text-danger')}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}
