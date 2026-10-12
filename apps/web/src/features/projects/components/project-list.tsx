'use client';

import { AlertTriangle, CalendarDays, ChevronRight, Download, FolderKanban, LayoutGrid, List, Loader2, MoreHorizontal, Plus, Search, TimerReset } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from '@/features/auth/api';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { appConfig } from '@/shared/config/env';
import { routes } from '@/shared/config/routes';
import { Permission, StatusCategory } from '@/shared/constants/domain';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { api, errorMessage } from '@/shared/lib/api-client';
import { cn, formatDate, fullName, humanize, isOverdue } from '@/shared/lib/utils';
import type { Paginated } from '@/shared/types/api';
import { Avatar, AvatarGroup } from '@/shared/ui/avatar';
import { Badge, ColorBadge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Dropdown, DropdownItem } from '@/shared/ui/dropdown';
import { EmptyState, ErrorState, Skeleton } from '@/shared/ui/feedback';
import { Input, Select } from '@/shared/ui/form';
import { Pagination, ProgressBar, Segmented } from '@/shared/ui/layout';
import { Table, Td, Th, Tr } from '@/shared/ui/table';
import { useProjects, useProjectSummary } from '../api';
import type { Project, ProjectQuery, ProjectSummary } from '../types';
import { HealthBadge } from './health-badge';
import { ProjectActions } from './project-actions';
import { ProjectFormModal } from './project-form-modal';

type View = 'grid' | 'list';
type Scope = 'all' | 'active' | 'planning' | 'completed' | 'archived';

/** Status tabs map to the semantic status category (names of statuses are configurable). */
const SCOPES: { value: Scope; label: string; query: Pick<ProjectQuery, 'statusCategory' | 'archived'>; count: (s: ProjectSummary) => number }[] = [
  { value: 'all', label: 'All', query: {}, count: (s) => s.total },
  { value: 'active', label: 'Active', query: { statusCategory: StatusCategory.IN_PROGRESS }, count: (s) => s.byCategory.IN_PROGRESS },
  { value: 'planning', label: 'Planning', query: { statusCategory: StatusCategory.OPEN }, count: (s) => s.byCategory.OPEN },
  { value: 'completed', label: 'Completed', query: { statusCategory: StatusCategory.CLOSED }, count: (s) => s.byCategory.CLOSED },
  { value: 'archived', label: 'Archived', query: { archived: true }, count: (s) => s.archived },
];

const SORTS = [
  { value: 'recent', label: 'Recent activity', sortBy: 'updatedAt', sortOrder: 'desc' },
  { value: 'name', label: 'Name (A–Z)', sortBy: 'name', sortOrder: 'asc' },
  { value: 'due', label: 'Due date', sortBy: 'endDate', sortOrder: 'asc' },
  { value: 'newest', label: 'Newest', sortBy: 'createdAt', sortOrder: 'desc' },
] as const;
type Sort = (typeof SORTS)[number]['value'];

/** Keyboard shortcut that opens the "new project" dialog. */
const CREATE_SHORTCUT = 'c';

export function ProjectList() {
  const router = useRouter();
  const { can } = usePermissions();
  const { data: session } = useSession();
  const canCreate = can(Permission.PROJECTS_CREATE);
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [page, setPage] = useState(1);
  const [view, setView] = useState<View>('grid');
  const [creating, setCreating] = useState(false);
  const debouncedSearch = useDebounce(search);

  useEffect(() => setPage(1), [debouncedSearch, scope, sort]);

  // "C" opens the create dialog (ignored while typing).
  useEffect(() => {
    if (!canCreate) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
      if (!typing && !event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === CREATE_SHORTCUT) {
        event.preventDefault();
        setCreating(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canCreate]);

  const scopeConfig = SCOPES.find((s) => s.value === scope)!;
  const sortConfig = SORTS.find((s) => s.value === sort)!;
  const query: ProjectQuery = {
    search: debouncedSearch || undefined,
    ...scopeConfig.query,
    sortBy: sortConfig.sortBy,
    sortOrder: sortConfig.sortOrder,
    page,
    limit: appConfig.defaultPageSize,
  };

  const { data: summary } = useProjectSummary();
  const { data, isLoading, isError, error, refetch } = useProjects(query);

  const exporter = useProjectExport(query);
  const showCreateCard = canCreate && scope !== 'archived';

  return (
    <>
      {/* Header */}
      <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-muted">
        <span className="truncate">{session?.organization?.name}</span>
        <span>/</span>
        <span>Projects</span>
        <span>/</span>
        <span className="text-brand">{scope === 'all' ? 'All projects' : scopeConfig.label}</span>
      </nav>
      <div className="mb-5 flex items-start justify-between gap-3 sm:items-end">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Projects</h1>
          <SummaryLine summary={summary} onShowActive={() => setScope('active')} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canCreate && (
            <Button onClick={() => setCreating(true)} aria-label="New project">
              <Plus /> <span className="hidden sm:inline">New project</span>
            </Button>
          )}
          <Dropdown
            trigger={({ open, toggle }) => (
              <Button variant="secondary" size="icon" className="h-[var(--control-h)] w-[var(--control-h)]" aria-label="More actions" aria-expanded={open} onClick={toggle}>
                {exporter.busy ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
              </Button>
            )}
          >
            {(close) => (
              <DropdownItem
                onClick={() => {
                  close();
                  void exporter.run();
                }}
              >
                <Download /> Export CSV
              </DropdownItem>
            )}
          </Dropdown>
        </div>
      </div>

      {/* Filter bar: search, status, sort and view in one compact row */}
      <Card className="mb-4 flex flex-col gap-2 p-2 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input placeholder="Filter by name or key…" aria-label="Filter projects" className="h-8 border-transparent bg-surface-muted/60 pl-9 text-sm shadow-none" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <Select aria-label="Project status" className="h-8 w-auto min-w-0 flex-1 text-xs sm:min-w-36 sm:flex-none" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
            {SCOPES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.value === 'all' ? 'All' : s.label}
                {summary ? ` (${s.count(summary)})` : ''}
              </option>
            ))}
          </Select>
          <Select aria-label="Sort projects" className="h-8 w-auto min-w-0 flex-1 text-xs sm:min-w-36 sm:flex-none" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                Sort: {s.label}
              </option>
            ))}
          </Select>
          <Segmented<View>
            aria-label="View"
            className="shrink-0"
            value={view}
            onChange={setView}
            options={[
              { value: 'grid', label: <span className="inline-flex items-center gap-1.5" title="Grid view"><LayoutGrid /><span className="sr-only">Grid</span></span> },
              { value: 'list', label: <span className="inline-flex items-center gap-1.5" title="List view"><List /><span className="sr-only">List</span></span> },
            ]}
          />
        </div>
      </Card>

      {/* Results */}
      {isLoading ? (
        <ProjectGridSkeleton />
      ) : isError ? (
        <Card>
          <ErrorState message={errorMessage(error)} onRetry={refetch} />
        </Card>
      ) : !data?.data.length && !(showCreateCard && !debouncedSearch) ? (
        <Card>
          <EmptyState icon={<FolderKanban />} title="No projects match" description="Try another status or clear the filter." />
        </Card>
      ) : view === 'grid' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data?.data.map((project) => <ProjectCard key={project.id} project={project} />)}
          {showCreateCard && <CreateProjectCard onClick={() => setCreating(true)} />}
        </div>
      ) : (
        <ProjectTable projects={data?.data ?? []} />
      )}

      {data && data.meta.totalPages > 1 && (
        <Card className="mt-4">
          <Pagination
            className="border-t-0"
            page={data.meta.page}
            totalPages={data.meta.totalPages}
            total={data.meta.total}
            limit={data.meta.limit}
            itemLabel={scope === 'all' ? 'projects' : `${scopeConfig.label.toLowerCase()} projects`}
            onPageChange={setPage}
          />
        </Card>
      )}

      <ProjectFormModal open={creating} onClose={() => setCreating(false)} onSaved={(project) => router.push(routes.project(project.id))} />
    </>
  );
}

// ─── Pieces ─────────────────────────────────────────────────────

/** One line of portfolio numbers in place of a row of KPI tiles. */
function SummaryLine({ summary, onShowActive }: { summary?: ProjectSummary; onShowActive: () => void }) {
  if (!summary) return <Skeleton className="mt-2 h-4 w-72" />;
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
      <span>
        <span className="font-semibold tabular-nums text-foreground">{summary.total}</span> projects · {summary.members} members
      </span>
      <span className="hidden text-border-strong sm:inline">|</span>
      <button type="button" onClick={onShowActive} className="hover:text-foreground">
        <span className="font-semibold tabular-nums text-success">{summary.byCategory.IN_PROGRESS}</span> active
      </button>
      <span>
        <span className="font-semibold tabular-nums text-brand">{summary.byCategory.OPEN}</span> in planning
      </span>
      {summary.projectsWithOverdue > 0 ? (
        <span className="inline-flex items-center gap-1 rounded-md bg-danger-soft px-1.5 py-0.5 text-xs font-medium text-danger ring-1 ring-inset ring-danger/20">
          <AlertTriangle className="size-3" /> {summary.overdueTasks} overdue {summary.overdueTasks === 1 ? 'task' : 'tasks'} in {summary.projectsWithOverdue}{' '}
          {summary.projectsWithOverdue === 1 ? 'project' : 'projects'}
        </span>
      ) : (
        <span className="text-xs">Nothing overdue</span>
      )}
    </p>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const closed = project.status.category === StatusCategory.CLOSED;
  const late = isOverdue(project.endDate, closed);
  const members = project.members.map((m) => m.user);
  return (
    <Card className="group relative flex flex-col p-[var(--card-p)] transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-ui-md">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-muted px-2 py-0.5 font-mono text-[11px] font-medium text-foreground-soft">
          <span className="size-2 rounded-[2px]" style={{ backgroundColor: project.color ?? 'var(--brand)' }} />
          {project.key}
        </span>
        <ColorBadge color={project.status.color} label={project.status.name} />
        {!project.isArchived && <HealthBadge health={project.health} />}
        {project.isArchived && <Badge tone="warning">Archived</Badge>}
      </div>

      <Link href={routes.project(project.id)} className="mt-2.5 block after:absolute after:inset-0 after:rounded-ui-lg">
        <h3 className="truncate text-[15px] font-semibold text-foreground group-hover:text-brand">{project.name}</h3>
      </Link>
      <p className="mt-1 line-clamp-2 min-h-10 text-sm text-muted" title={project.description || undefined}>{project.description || 'No description provided.'}</p>

      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-muted">
            {project.stats.completedTasks} of {project.stats.totalTasks} tasks complete
          </span>
          <span className="font-semibold tabular-nums text-foreground">{project.stats.progress}%</span>
        </div>
        <ProgressBar value={project.stats.progress} color={project.stats.progress >= 75 ? 'var(--success)' : undefined} />
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted">
        <span className="flex items-center gap-2">
          <AvatarGroup users={members} max={3} />
          <span>{project._count.members} {project._count.members === 1 ? 'member' : 'members'}</span>
        </span>
        <span className="flex items-center gap-2">
          {project.stats.overdueTasks > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-danger-soft px-1.5 py-0.5 font-medium text-danger ring-1 ring-inset ring-danger/20">
              <TimerReset className="size-3" /> {project.stats.overdueTasks} overdue
            </span>
          )}
          {project.endDate && (
            <span className={cn('inline-flex items-center gap-1 whitespace-nowrap', late && 'font-medium text-danger')}>
              <CalendarDays className="size-3.5" /> {formatDate(project.endDate)}
            </span>
          )}
          <span title={`Owner: ${fullName(project.owner)}`}>
            <Avatar user={project.owner} size="xs" />
          </span>
        </span>
      </div>
    </Card>
  );
}

function CreateProjectCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Set up task lists, milestones, a timeline and your team in a few steps."
      className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-ui-lg border border-dashed border-border-strong bg-surface/40 p-5 text-center transition-colors hover:border-brand hover:bg-brand-soft/30"
    >
      <span className="flex size-9 items-center justify-center rounded-full border border-border bg-surface text-muted shadow-ui-sm">
        <Plus className="size-4" />
      </span>
      <span className="text-sm font-semibold text-foreground">Create new project</span>
      <span className="inline-flex items-center gap-1.5 text-xs text-muted">
        or press <kbd className="rounded border border-border bg-surface-muted px-1.5 font-mono text-[10px] uppercase">{CREATE_SHORTCUT}</kbd>
      </span>
    </button>
  );
}

function ProjectGridSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <Card key={i} className="space-y-3 p-[var(--card-p)]">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-14 w-full" />
        </Card>
      ))}
    </div>
  );
}

function ProjectTable({ projects }: { projects: Project[] }) {
  // Coordinators and root manage every project.
  const canManage = usePermissions().can(Permission.PROJECTS_VIEW_ALL);
  if (!projects.length) {
    return (
      <Card>
        <EmptyState icon={<FolderKanban />} title="No projects match" />
      </Card>
    );
  }
  return (
    <Card>
      <Table>
        <thead>
          <tr>
            <Th>Project</Th>
            <Th>Status</Th>
            <Th>Health</Th>
            <Th>Owner</Th>
            <Th className="min-w-44">Progress</Th>
            <Th className="text-right">Overdue</Th>
            <Th>Due</Th>
            <Th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <Tr key={project.id}>
              <Td>
                <Link href={routes.project(project.id)} className="group flex items-center gap-2.5">
                  <span className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: project.color ?? 'var(--brand)' }} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground group-hover:text-brand">{project.name}</span>
                    <span className="block font-mono text-xs text-muted">{project.key}</span>
                  </span>
                </Link>
              </Td>
              <Td>
                <ColorBadge color={project.status.color} label={project.status.name} />
              </Td>
              <Td>
                <HealthBadge health={project.health} />
              </Td>
              <Td>
                <span className="flex items-center gap-2 whitespace-nowrap">
                  <Avatar user={project.owner} size="xs" /> {fullName(project.owner)}
                </span>
              </Td>
              <Td>
                <div className="flex items-center gap-2">
                  <ProgressBar value={project.stats.progress} />
                  <span className="w-9 text-right text-xs tabular-nums">{project.stats.progress}%</span>
                </div>
              </Td>
              <Td className={cn('text-right tabular-nums', project.stats.overdueTasks > 0 && 'font-medium text-danger')}>{project.stats.overdueTasks}</Td>
              <Td className="whitespace-nowrap text-muted">{formatDate(project.endDate)}</Td>
              <Td>
                {canManage ? (
                  <ProjectActions project={project} afterDelete={() => undefined} />
                ) : (
                  <Link href={routes.project(project.id)} aria-label={`Open ${project.name}`} className="text-muted hover:text-foreground">
                    <ChevronRight className="size-4" />
                  </Link>
                )}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

/** Exports every project matching the current filters (not just the visible page). */
function useProjectExport(query: ProjectQuery) {
  const [busy, setBusy] = useState(false);
  const exportQuery = useMemo(() => ({ ...query, page: 1, limit: appConfig.boardPageSize }), [query]);

  const run = async () => {
    setBusy(true);
    try {
      const { data } = await api.get<Paginated<Project>>('/projects', { ...exportQuery });
      const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
      const header = ['Key', 'Project', 'Status', 'Health', 'Owner', 'Members', 'Progress %', 'Open tasks', 'Overdue tasks', 'Start', 'End'];
      const rows = data.map((p) =>
        [p.key, p.name, p.status.name, p.health ? humanize(p.health) : '', fullName(p.owner), p._count.members, p.stats.progress, p.stats.openTasks, p.stats.overdueTasks, p.startDate?.slice(0, 10) ?? '', p.endDate?.slice(0, 10) ?? '']
          .map(escape)
          .join(','),
      );
      const blob = new Blob([[header.map(escape).join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), { href: url, download: `projects-${new Date().toISOString().slice(0, 10)}.csv` }).click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  };

  return { busy, run };
}
