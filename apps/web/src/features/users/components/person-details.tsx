'use client';

import { AlertTriangle, ArrowLeft, MessageCircle, Bug, CheckCircle2, Clock, Flag, FolderKanban, ListTodo, Mail, Users } from 'lucide-react';
import Link from 'next/link';
import { routes } from '@/shared/config/routes';
import { OrgRole, roleLabel } from '@/shared/constants/domain';
import { errorMessage } from '@/shared/lib/api-client';
import { formatDate, formatDateTime, formatMinutes, fullName, humanize, isOverdue, timeAgo } from '@/shared/lib/utils';
import { Avatar } from '@/shared/ui/avatar';
import { Badge, ColorBadge } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';
import { CollapsibleCard } from '@/shared/ui/collapsible';
import { EmptyState, ErrorState, Spinner } from '@/shared/ui/feedback';
import { StatCard } from '@/shared/ui/layout';
import { cn } from '@/shared/lib/utils';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { Permission } from '@/shared/constants/domain';
import { useUserDetails } from '../api';

/** One person's projects, open work, time and activity, for coordinators and root. */
export function PersonDetails({ userId }: { userId: string }) {
  const { can, user } = usePermissions();
  if (!user) return <Spinner />;
  if (!can(Permission.USERS_MANAGE)) return <EmptyState icon={<Users />} title="Only project coordinators can open people's details" />;
  return <PersonDetailsContent userId={userId} />;
}

function PersonDetailsContent({ userId }: { userId: string }) {
  const { data, isLoading, isError, error, refetch } = useUserDetails(userId);
  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState message={errorMessage(error, 'Person not found')} onRetry={refetch} />;
  const { user, stats } = data;

  return (
    <div className="space-y-4">
      <Link href={routes.people} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-foreground">
        <ArrowLeft className="size-3.5" /> People
      </Link>

      <Card className="flex flex-col gap-4 p-[var(--card-p)] sm:flex-row sm:items-center">
        <Avatar user={user} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight">{fullName(user)}</h1>
            <Badge tone={user.role === OrgRole.PROJECT_COORDINATOR ? 'brand' : 'neutral'}>{roleLabel(user.role)}</Badge>
            {!user.isActive && <Badge tone="danger">Deactivated</Badge>}
          </div>
          <p className="text-sm text-muted">{user.jobTitle ?? '—'}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <a href={`mailto:${user.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
              <Mail className="size-3.5" /> {user.email}
            </a>
            <span>Last sign-in {formatDateTime(user.lastLoginAt)}</span>
            <span>Joined {formatDate(user.createdAt)}</span>
          </p>
        </div>
        {user.isActive && (
          <Link
            href={`${routes.messages}?to=${user.id}`}
            className="inline-flex h-9 items-center gap-1.5 self-start rounded-ui border border-border bg-surface px-3 text-sm font-medium shadow-ui-sm hover:bg-surface-hover sm:self-center"
          >
            <MessageCircle className="size-4" /> Message
          </Link>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Projects" value={stats.projects} icon={<FolderKanban />} />
        <StatCard label="Open tasks" value={stats.openTasks} icon={<ListTodo />} hint={`${stats.completedTasks30d} completed in 30 days`} tone="success" />
        <StatCard label="Overdue" value={stats.overdueTasks} icon={<AlertTriangle />} hint={`${stats.openIssues} open issues`} tone={stats.overdueTasks ? 'danger' : 'warning'} />
        <StatCard label="Time this week" value={formatMinutes(stats.minutesThisWeek)} icon={<Clock />} hint={`${formatMinutes(stats.minutes30d)} in 30 days`} tone="warning" />
      </div>

      <CollapsibleCard title="Projects" meta={data.projects.length} storageKey="person.projects" icon={<FolderKanban />}>
        {data.projects.length ? (
          <ul className="divide-y divide-border">
            {data.projects.map((project) => (
              <li key={project.id}>
                <Link href={routes.project(project.id)} className={cn('flex items-center gap-3 px-[var(--card-p)] py-2.5 hover:bg-surface-hover', project.isArchived && 'opacity-60')}>
                  <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: project.color ?? 'var(--brand)' }} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{project.name}</span>
                  <ColorBadge color={project.status.color} label={project.isArchived ? 'Archived' : project.status.name} variant="dot" />
                  <span className="w-28 text-right text-xs text-muted">{project.openTasks} open tasks</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Not on any project yet.</Empty>
        )}
      </CollapsibleCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <CollapsibleCard title="Open tasks" meta={data.tasks.length} storageKey="person.tasks" icon={<ListTodo />}>
          {data.tasks.length ? (
            <ul className="scrollbar-thin max-h-96 divide-y divide-border overflow-y-auto">
              {data.tasks.map((task) => (
                <li key={task.id}>
                  <Link href={routes.projectTask(task.project.id, task.id)} className="flex items-center gap-3 px-[var(--card-p)] py-2.5 hover:bg-surface-hover">
                    <span className="w-16 shrink-0 font-mono text-[11px] text-muted">
                      {task.project.key}-{task.number}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
                    <ColorBadge color={task.status.color} label={task.status.name} variant="dot" />
                    <span className={cn('w-20 text-right text-xs', isOverdue(task.dueDate) ? 'font-medium text-danger' : 'text-muted')}>{task.dueDate ? formatDate(task.dueDate) : '—'}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>
              <CheckCircle2 className="mx-auto mb-1 size-5" /> Nothing open.
            </Empty>
          )}
        </CollapsibleCard>

        <CollapsibleCard title="Open issues" meta={data.issues.length} storageKey="person.issues" icon={<Bug />} defaultOpen={data.issues.length > 0}>
          {data.issues.length ? (
            <ul className="scrollbar-thin max-h-96 divide-y divide-border overflow-y-auto">
              {data.issues.map((issue) => (
                <li key={issue.id}>
                  <Link href={`${routes.projectIssues(issue.project.id)}?issueId=${issue.id}`} className="flex items-center gap-3 px-[var(--card-p)] py-2.5 hover:bg-surface-hover">
                    <span className="min-w-0 flex-1 truncate text-sm">{issue.title}</span>
                    <ColorBadge color={issue.severity.color} label={issue.severity.name} variant="dot" />
                    <span className="w-20 text-right text-xs text-muted">{issue.dueDate ? formatDate(issue.dueDate) : '—'}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No open issues.</Empty>
          )}
        </CollapsibleCard>

        <CollapsibleCard title="Reported issues" meta={data.reportedIssues.length} storageKey="person.reported" icon={<Flag />} defaultOpen={data.reportedIssues.length > 0}>
          {data.reportedIssues.length ? (
            <ul className="scrollbar-thin max-h-96 divide-y divide-border overflow-y-auto">
              {data.reportedIssues.map((issue) => (
                <li key={issue.id}>
                  <Link href={`${routes.projectIssues(issue.project.id)}?issueId=${issue.id}`} className="flex items-center gap-3 px-[var(--card-p)] py-2.5 hover:bg-surface-hover">
                    <span className="w-24 shrink-0 truncate text-xs text-muted">
                      {issue.project.key}-BUG-{issue.number}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{issue.title}</span>
                    <ColorBadge color={issue.status.color} label={issue.status.name} variant="dot" />
                    <span className="hidden w-24 text-right text-xs text-muted sm:block">{formatDate(issue.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No issues reported.</Empty>
          )}
        </CollapsibleCard>

        <CollapsibleCard title="Recent time" storageKey="person.time" icon={<Clock />} defaultOpen={false}>
          {data.recentTime.length ? (
            <ul className="divide-y divide-border">
              {data.recentTime.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 px-[var(--card-p)] py-2.5 text-sm">
                  <span className="w-24 shrink-0 text-xs text-muted">{formatDate(entry.date)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {entry.project.name}
                    {entry.notes && <span className="text-muted"> · {entry.notes}</span>}
                  </span>
                  <span className="text-xs text-muted">{humanize(entry.approvalStatus)}</span>
                  <span className="w-14 text-right font-medium tabular-nums">{formatMinutes(entry.minutes)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No time logged yet.</Empty>
          )}
        </CollapsibleCard>

        <CollapsibleCard title="Recent activity" storageKey="person.activity" defaultOpen={false}>
          {data.activity.length ? (
            <ul className="divide-y divide-border">
              {data.activity.map((item) => (
                <li key={item.id} className="px-[var(--card-p)] py-2.5 text-sm">
                  <p className="truncate">{item.summary}</p>
                  <p className="text-xs text-muted">
                    {timeAgo(item.createdAt)}
                    {item.project && ` · ${item.project.name}`}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No activity yet.</Empty>
          )}
        </CollapsibleCard>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-[var(--card-p)] py-8 text-center text-sm text-muted">{children}</div>;
}
