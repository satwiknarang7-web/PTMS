import { Injectable } from '@nestjs/common';
import { Lookup, Prisma } from '@prisma/client';
import { LookupType, StatusCategory } from '../../common/constants/domain.constants';
import { isViewer } from '../../common/constants/roles.constants';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { addDays, isOverdue, overdueCutoff, startOfWeekUtc } from '../../common/utils/date.util';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectAccessService } from '../projects/project-access.service';
import { ProjectProgressService } from '../projects/project-progress.service';
import { USER_SUMMARY_SELECT } from '../users/users.select';
import { DASHBOARD_DEFAULTS } from './dashboard.constants';

export interface LookupCount {
  id: string;
  name: string;
  color: string;
  count: number;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly progress: ProjectProgressService,
  ) {}

  /** Small counters shown as badges in the navigation. */
  async navCounts(user: AuthenticatedUser) {
    const visibleProjects: Prisma.ProjectWhereInput = { ...this.access.visibleProjectsWhere(user), isArchived: false };
    const [myOpenTasks, projects] = await Promise.all([
      this.prisma.task.count({
        where: {
          project: visibleProjects,
          status: { category: { not: StatusCategory.CLOSED } },
          assignees: { some: { userId: user.id } },
        },
      }),
      this.prisma.project.count({ where: visibleProjects }),
    ]);
    return { myOpenTasks, projects };
  }

  /** Organization-wide (permission aware) home dashboard. */
  async overview(user: AuthenticatedUser, listSize: number = DASHBOARD_DEFAULTS.listSize) {
    const now = new Date();
    const organization = await this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId } });
    const weekStart = startOfWeekUtc(now, organization.weekStartsOn);
    const visibleProjects: Prisma.ProjectWhereInput = { ...this.access.visibleProjectsWhere(user), isArchived: false };
    const taskScope: Prisma.TaskWhereInput = { project: visibleProjects };
    const openTask: Prisma.TaskWhereInput = { status: { category: { not: StatusCategory.CLOSED } } };
    const openIssue: Prisma.IssueWhereInput = {
      project: visibleProjects,
      status: { category: { not: StatusCategory.CLOSED } },
    };

    const [
      activeProjects,
      openTasks,
      overdueTasks,
      myOpenTasks,
      openIssues,
      myOpenIssues,
      completedThisWeek,
      minutesThisWeek,
      lookups,
      tasksByStatus,
      tasksByPriority,
      upcomingMilestones,
      myTasks,
      recentProjects,
    ] = await Promise.all([
      this.prisma.project.count({ where: { ...visibleProjects, status: { category: { not: StatusCategory.CLOSED } } } }),
      this.prisma.task.count({ where: { ...taskScope, ...openTask } }),
      this.prisma.task.count({ where: { ...taskScope, ...openTask, dueDate: { lt: overdueCutoff(organization.timezone, now) } } }),
      this.prisma.task.count({ where: { ...taskScope, ...openTask, assignees: { some: { userId: user.id } } } }),
      this.prisma.issue.count({ where: openIssue }),
      this.prisma.issue.count({ where: { ...openIssue, assigneeId: user.id } }),
      this.prisma.task.count({ where: { ...taskScope, completedAt: { gte: weekStart } } }),
      this.prisma.timeEntry.aggregate({ where: { userId: user.id, date: { gte: weekStart } }, _sum: { minutes: true } }),
      this.prisma.lookup.findMany({ where: { organizationId: user.organizationId }, orderBy: { position: 'asc' } }),
      this.prisma.task.groupBy({ by: ['statusId'], where: taskScope, _count: { _all: true } }),
      this.prisma.task.groupBy({ by: ['priorityId'], where: { ...taskScope, ...openTask }, _count: { _all: true } }),
      this.prisma.milestone.findMany({
        where: { project: visibleProjects, completedAt: null, dueDate: { gte: addDays(now, -1) } },
        include: { project: { select: { id: true, name: true, key: true, color: true } } },
        orderBy: { dueDate: 'asc' },
        take: listSize,
      }),
      this.prisma.task.findMany({
        where: {
          ...taskScope,
          ...openTask,
          assignees: { some: { userId: user.id } },
          dueDate: { lte: addDays(now, DASHBOARD_DEFAULTS.dueSoonDays) },
        },
        include: {
          status: { select: { id: true, name: true, color: true } },
          priority: { select: { id: true, name: true, color: true } },
          project: { select: { id: true, name: true, key: true, color: true } },
        },
        orderBy: { dueDate: 'asc' },
        take: listSize,
      }),
      this.prisma.project.findMany({
        where: visibleProjects,
        include: { status: true, owner: { select: USER_SUMMARY_SELECT } },
        orderBy: { updatedAt: 'desc' },
        take: listSize,
      }),
    ]);

    const stats = await this.progress.forProjects(
      user.organizationId,
      recentProjects.map((p) => p.id),
    );

    return {
      counts: {
        activeProjects,
        openTasks,
        overdueTasks,
        myOpenTasks,
        openIssues,
        myOpenIssues,
        completedThisWeek,
        minutesThisWeek: minutesThisWeek._sum.minutes ?? 0,
      },
      tasksByStatus: this.mapCounts(lookups, LookupType.TASK_STATUS, tasksByStatus, 'statusId'),
      tasksByPriority: this.mapCounts(lookups, LookupType.PRIORITY, tasksByPriority, 'priorityId'),
      upcomingMilestones,
      myTasks,
      projects: recentProjects.map((project) => ({ ...project, stats: stats.get(project.id)! })),
    };
  }

  /** Detailed dashboard for a single project. */
  async project(user: AuthenticatedUser, projectId: string) {
    const { project } = await this.access.assertCanView(user, projectId);
    const openTask: Prisma.TaskWhereInput = { projectId, status: { category: { not: StatusCategory.CLOSED } } };

    const [
      lookups,
      byStatus,
      byPriority,
      issuesByStatus,
      issuesBySeverity,
      logged,
      billable,
      openAssignments,
      members,
      milestones,
      stats,
      estimated,
      organization,
    ] = await Promise.all([
      this.prisma.lookup.findMany({ where: { organizationId: user.organizationId }, orderBy: { position: 'asc' } }),
      this.prisma.task.groupBy({ by: ['statusId'], where: { projectId }, _count: { _all: true } }),
      this.prisma.task.groupBy({ by: ['priorityId'], where: openTask, _count: { _all: true } }),
      this.prisma.issue.groupBy({ by: ['statusId'], where: { projectId }, _count: { _all: true } }),
      this.prisma.issue.groupBy({
        by: ['severityId'],
        where: { projectId, status: { category: { not: StatusCategory.CLOSED } } },
        _count: { _all: true },
      }),
      this.prisma.timeEntry.aggregate({ where: { projectId }, _sum: { minutes: true } }),
      this.prisma.timeEntry.aggregate({ where: { projectId, isBillable: true }, _sum: { minutes: true } }),
      this.prisma.taskAssignee.findMany({
        where: { task: openTask },
        select: { userId: true, task: { select: { dueDate: true } } },
      }),
      this.prisma.projectMember.findMany({ where: { projectId }, include: { user: { select: USER_SUMMARY_SELECT } } }),
      this.prisma.milestone.findMany({ where: { projectId }, orderBy: { dueDate: 'asc' } }),
      this.progress.forProject(user.organizationId, projectId),
      this.prisma.task.aggregate({ where: { projectId }, _sum: { estimatedHours: true } }),
      this.prisma.organization.findUniqueOrThrow({ where: { id: user.organizationId }, select: { timezone: true } }),
    ]);
    const cutoff = overdueCutoff(organization.timezone);

    const workload = members
      .map((member) => {
        const own = openAssignments.filter((a) => a.userId === member.userId);
        return {
          user: member.user,
          role: member.role,
          openTasks: own.length,
          overdueTasks: own.filter((a) => isOverdue(a.task.dueDate, cutoff)).length,
        };
      })
      .sort((a, b) => b.openTasks - a.openTasks);

    // Clients see progress, not budget, hours or how the team's work is spread.
    const client = isViewer(user.role);
    return {
      project: { id: project.id, name: project.name, budgetHours: client ? null : project.budgetHours, endDate: project.endDate },
      stats,
      loggedMinutes: client ? 0 : (logged._sum.minutes ?? 0),
      billableMinutes: client ? 0 : (billable._sum.minutes ?? 0),
      estimatedHours: client ? 0 : (estimated._sum.estimatedHours ?? 0),
      tasksByStatus: this.mapCounts(lookups, LookupType.TASK_STATUS, byStatus, 'statusId'),
      tasksByPriority: this.mapCounts(lookups, LookupType.PRIORITY, byPriority, 'priorityId'),
      issuesByStatus: this.mapCounts(lookups, LookupType.ISSUE_STATUS, issuesByStatus, 'statusId'),
      issuesBySeverity: this.mapCounts(lookups, LookupType.ISSUE_SEVERITY, issuesBySeverity, 'severityId'),
      // Clients see progress and budget, not how the team's work is spread.
      workload: client ? [] : workload,
      milestones: {
        total: milestones.length,
        completed: milestones.filter((m) => m.completedAt).length,
        overdue: milestones.filter((m) => !m.completedAt && isOverdue(m.dueDate, cutoff)).length,
        next: milestones.find((m) => !m.completedAt) ?? null,
      },
    };
  }

  /** Joins grouped counts with lookup metadata, keeping configured order and zero buckets. */
  private mapCounts<K extends string>(
    lookups: Lookup[],
    type: LookupType,
    rows: (Record<K, string> & { _count: { _all: number } })[],
    key: K,
  ): LookupCount[] {
    return lookups
      .filter((lookup) => lookup.type === type)
      .map((lookup) => ({
        id: lookup.id,
        name: lookup.name,
        color: lookup.color,
        count: rows.find((row) => row[key] === lookup.id)?._count._all ?? 0,
      }));
  }
}
