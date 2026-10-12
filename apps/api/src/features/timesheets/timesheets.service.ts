import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TimeEntry } from '@prisma/client';
import { ActivityAction, ApprovalStatus, EntityType, NotificationType } from '../../common/constants/domain.constants';
import { hasPermission, Permission } from '../../common/constants/permissions.constants';
import { isCoordinator, OrgRole, PlatformRole } from '../../common/constants/roles.constants';
import { NotificationLinks } from '../../common/events/domain-events';
import { EventPublisher } from '../../common/events/event-publisher.service';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { PaginationService } from '../../common/pagination/pagination.service';
import { fullName } from '../../common/utils/string.util';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectAccessService } from '../projects/project-access.service';
import { USER_SUMMARY_SELECT } from '../users/users.select';
import {
  CreateTimeEntryDto,
  TimeEntryQueryDto,
  TimeSummaryQueryDto,
  UpdateTimeEntryDto,
} from './dto/time-entry.dto';

const TIME_ENTRY_INCLUDE = {
  user: { select: USER_SUMMARY_SELECT },
  approvedBy: { select: USER_SUMMARY_SELECT },
  project: { select: { id: true, name: true, key: true, color: true } },
  task: { select: { id: true, number: true, title: true } },
  issue: { select: { id: true, number: true, title: true } },
} satisfies Prisma.TimeEntryInclude;

type TimeEntryWithRelations = Prisma.TimeEntryGetPayload<{ include: typeof TIME_ENTRY_INCLUDE }>;

@Injectable()
export class TimesheetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly pagination: PaginationService,
    private readonly events: EventPublisher,
  ) {}

  /**
   * People whose time can be filtered on: active members of the organization and the root admins
   * working on its projects (they belong to no organization, so the people list leaves them out).
   */
  async people(user: AuthenticatedUser, projectId?: string) {
    if (projectId) await this.access.assertCanView(user, projectId);
    const onProjects: Prisma.UserWhereInput = {
      memberships: { some: projectId ? { projectId } : { project: { organizationId: user.organizationId } } },
    };
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { not: OrgRole.VIEWER },
        OR: [
          projectId ? onProjects : { organizationId: user.organizationId },
          { role: PlatformRole.ROOT, ...onProjects },
          // Anyone with time logged here, so past entries stay filterable.
          { timeEntries: { some: projectId ? { projectId } : { project: { organizationId: user.organizationId } } } },
        ],
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: USER_SUMMARY_SELECT,
    });
  }

  async findAll(user: AuthenticatedUser, query: TimeEntryQueryDto) {
    const page = this.pagination.resolve(query.page, query.limit);
    const where = this.buildWhere(user, query);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.timeEntry.findMany({
        where,
        include: TIME_ENTRY_INCLUDE,
        orderBy: [{ date: query.sortOrder ?? 'desc' }, { createdAt: 'desc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.timeEntry.count({ where }),
    ]);
    return this.pagination.build(data, total, page);
  }

  async summary(user: AuthenticatedUser, query: TimeSummaryQueryDto) {
    const where = this.buildWhere(user, query);
    const [totals, billable, byDay, byProject, byUser] = await Promise.all([
      this.prisma.timeEntry.aggregate({ where, _sum: { minutes: true }, _count: { _all: true } }),
      this.prisma.timeEntry.aggregate({ where: { AND: [where, { isBillable: true }] }, _sum: { minutes: true } }),
      this.prisma.timeEntry.groupBy({ by: ['date'], where, _sum: { minutes: true }, orderBy: { date: 'asc' } }),
      this.prisma.timeEntry.groupBy({ by: ['projectId'], where, _sum: { minutes: true } }),
      this.prisma.timeEntry.groupBy({ by: ['userId'], where, _sum: { minutes: true } }),
    ]);

    const [projects, users] = await Promise.all([
      this.prisma.project.findMany({
        where: { id: { in: byProject.map((r) => r.projectId) } },
        select: { id: true, name: true, key: true, color: true },
      }),
      this.prisma.user.findMany({ where: { id: { in: byUser.map((r) => r.userId) } }, select: USER_SUMMARY_SELECT }),
    ]);

    return {
      totalMinutes: totals._sum.minutes ?? 0,
      billableMinutes: billable._sum.minutes ?? 0,
      entries: totals._count._all,
      byDay: byDay.map((row) => ({ date: row.date, minutes: row._sum.minutes ?? 0 })),
      byProject: byProject
        .map((row) => ({ project: projects.find((p) => p.id === row.projectId)!, minutes: row._sum.minutes ?? 0 }))
        .sort((a, b) => b.minutes - a.minutes),
      byUser: byUser
        .map((row) => ({ user: users.find((u) => u.id === row.userId)!, minutes: row._sum.minutes ?? 0 }))
        .sort((a, b) => b.minutes - a.minutes),
    };
  }

  async create(user: AuthenticatedUser, dto: CreateTimeEntryDto) {
    await this.access.assertCanEdit(user, dto.projectId);
    await this.assertRelations(dto.projectId, dto);
    const entry = await this.prisma.timeEntry.create({
      data: {
        userId: user.id,
        projectId: dto.projectId,
        taskId: dto.taskId ?? null,
        issueId: dto.issueId ?? null,
        date: dto.date,
        minutes: dto.minutes,
        notes: dto.notes ?? null,
        isBillable: dto.isBillable ?? true,
        approvalStatus: ApprovalStatus.PENDING,
      },
      include: TIME_ENTRY_INCLUDE,
    });
    this.recordActivity(user, entry, ActivityAction.CREATED, `logged ${this.hours(entry.minutes)} on ${entry.project.name}`);
    await this.requestApproval(user, entry);
    return entry;
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateTimeEntryDto) {
    const entry = await this.findVisible(user, id);
    await this.assertCanModify(user, entry);
    await this.assertRelations(entry.projectId, dto);
    const updated = await this.prisma.timeEntry.update({
      where: { id },
      // Any edit sends the entry back for approval.
      data: { ...dto, approvalStatus: ApprovalStatus.PENDING, approvedById: null, approvedAt: null },
      include: TIME_ENTRY_INCLUDE,
    });
    await this.requestApproval(user, updated);
    return updated;
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    const entry = await this.findVisible(user, id);
    await this.assertCanModify(user, entry);
    await this.prisma.timeEntry.delete({ where: { id } });
  }

  async review(user: AuthenticatedUser, id: string, status: ApprovalStatus) {
    const entry = await this.findVisible(user, id);
    const access = await this.access.resolve(user, entry.projectId);
    if (!hasPermission(user.role, Permission.TIMESHEETS_APPROVE) && !access.canManage) {
      throw new ForbiddenException('You cannot review time entries for this project');
    }
    if (entry.userId === user.id && !isCoordinator(user.role)) {
      throw new ForbiddenException('You cannot review your own time entries');
    }

    const updated = await this.prisma.timeEntry.update({
      where: { id },
      data: { approvalStatus: status, approvedById: user.id, approvedAt: new Date() },
      include: TIME_ENTRY_INCLUDE,
    });
    const approved = status === ApprovalStatus.APPROVED;
    this.recordActivity(
      user,
      updated,
      approved ? ActivityAction.APPROVED : ActivityAction.REJECTED,
      `${approved ? 'approved' : 'rejected'} ${this.hours(updated.minutes)} logged by ${fullName(updated.user)}`,
    );
    this.events.notify({
      recipientIds: [updated.userId],
      actorId: user.id,
      type: NotificationType.TIME_ENTRY_REVIEWED,
      title: `Time entry ${approved ? 'approved' : 'rejected'}`,
      body: `${fullName(user)} ${approved ? 'approved' : 'rejected'} ${this.hours(updated.minutes)} on ${updated.project.name}`,
      link: NotificationLinks.timesheet(),
    });
    return updated;
  }

  // ─── Private ─────────────────────────────────────────────────

  /**
   * Members see their own time; coordinators see the whole organization.
   */
  private buildWhere(user: AuthenticatedUser, query: TimeSummaryQueryDto): Prisma.TimeEntryWhereInput {
    const and: Prisma.TimeEntryWhereInput[] = [{ project: { organizationId: user.organizationId } }];
    if (!hasPermission(user.role, Permission.TIMESHEETS_VIEW_ALL)) and.push({ userId: user.id });
    if (query.mine) and.push({ userId: user.id });
    if (query.userId) and.push({ userId: query.userId });
    if (query.projectId) and.push({ projectId: query.projectId });
    if (query.taskId) and.push({ taskId: query.taskId });
    if (query.approvalStatus) and.push({ approvalStatus: query.approvalStatus });
    if (query.from) and.push({ date: { gte: query.from } });
    if (query.to) and.push({ date: { lte: query.to } });
    return { AND: and };
  }

  private async findVisible(user: AuthenticatedUser, id: string) {
    const entry = await this.prisma.timeEntry.findFirst({
      where: { AND: [{ id }, this.buildWhere(user, {})] },
      include: TIME_ENTRY_INCLUDE,
    });
    if (!entry) throw new NotFoundException('Time entry not found');
    return entry;
  }

  private async assertCanModify(user: AuthenticatedUser, entry: TimeEntry): Promise<void> {
    if (isCoordinator(user.role)) return;
    if (entry.userId !== user.id) throw new ForbiddenException('You can only change your own time entries');
    if (entry.approvalStatus === ApprovalStatus.APPROVED) {
      throw new BadRequestException('Approved entries are locked');
    }
    // Members change time only on projects they still work on, and never on archived ones.
    const { memberRole, project } = await this.access.resolve(user, entry.projectId);
    if (!memberRole) throw new ForbiddenException('You are no longer a member of this project');
    if (project.isArchived) throw new BadRequestException('Archived projects are read-only');
  }

  private async assertRelations(projectId: string, dto: Pick<UpdateTimeEntryDto, 'taskId' | 'issueId'>) {
    if (dto.taskId && !(await this.prisma.task.count({ where: { id: dto.taskId, projectId } }))) {
      throw new BadRequestException('Task does not belong to this project');
    }
    if (dto.issueId && !(await this.prisma.issue.count({ where: { id: dto.issueId, projectId } }))) {
      throw new BadRequestException('Issue does not belong to this project');
    }
  }

  /** Tells everyone who can approve this entry (the organization's project coordinators) that it is waiting. */
  private async requestApproval(actor: AuthenticatedUser, entry: TimeEntryWithRelations): Promise<void> {
    const approvers = await this.prisma.user.findMany({
      where: {
        organizationId: actor.organizationId,
        isActive: true,
        role: OrgRole.PROJECT_COORDINATOR,
      },
      select: { id: true },
    });
    const day = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(entry.date);
    this.events.notify({
      recipientIds: approvers.map((approver) => approver.id),
      actorId: actor.id,
      type: NotificationType.TIME_ENTRY_SUBMITTED,
      title: 'Time waiting for your approval',
      body: `${fullName(entry.user)} logged ${this.hours(entry.minutes)} on ${entry.project.name} for ${day}`,
      link: NotificationLinks.projectTimesheet(entry.projectId),
    });
  }

  private hours(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return [h ? `${h}h` : '', m ? `${m}m` : ''].filter(Boolean).join(' ') || '0m';
  }

  private recordActivity(user: AuthenticatedUser, entry: TimeEntry, action: ActivityAction, summary: string): void {
    this.events.activity({
      organizationId: user.organizationId,
      projectId: entry.projectId,
      actorId: user.id,
      entityType: EntityType.TIME_ENTRY,
      entityId: entry.id,
      action,
      summary,
    });
  }
}
