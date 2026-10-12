import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ActivityAction, EntityType, LookupType, NotificationType, StatusCategory } from '../../common/constants/domain.constants';
import { isRoot, PlatformRole, ProjectRole } from '../../common/constants/roles.constants';
import { NotificationLinks } from '../../common/events/domain-events';
import { EventPublisher } from '../../common/events/event-publisher.service';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { PaginationService } from '../../common/pagination/pagination.service';
import { fullName } from '../../common/utils/string.util';
import { PrismaService } from '../../prisma/prisma.service';
import { LookupsService } from '../lookups/lookups.service';
import { USER_SUMMARY_SELECT } from '../users/users.select';
import { AddMembersDto, CreateProjectDto, ProjectQueryDto, UpdateProjectDto } from './dto/project.dto';
import { ProjectAccessService } from './project-access.service';
import { evaluateProjectHealth } from './project-health';
import { ProjectProgressService, type ProgressStats } from './project-progress.service';

/** Number of member avatars embedded in project payloads (the full list has its own endpoint). */
const MEMBER_PREVIEW_COUNT = 4;

const PROJECT_INCLUDE = {
  status: true,
  owner: { select: USER_SUMMARY_SELECT },
  members: { take: MEMBER_PREVIEW_COUNT, orderBy: { createdAt: 'asc' }, select: { user: { select: USER_SUMMARY_SELECT } } },
  _count: { select: { members: true, milestones: true, issues: true } },
} satisfies Prisma.ProjectInclude;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly progress: ProjectProgressService,
    private readonly lookups: LookupsService,
    private readonly pagination: PaginationService,
    private readonly events: EventPublisher,
  ) {}

  async findAll(user: AuthenticatedUser, query: ProjectQueryDto) {
    const page = this.pagination.resolve(query.page, query.limit);
    const where: Prisma.ProjectWhereInput = {
      ...this.access.visibleProjectsWhere(user),
      isArchived: query.archived ?? false,
      ...(query.statusId ? { statusId: query.statusId } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.statusCategory ? { status: { category: query.statusCategory } } : {}),
      ...(query.search
        ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { key: { contains: query.search.toUpperCase(), mode: 'insensitive' } }] }
        : {}),
    };

    const [projects, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        include: PROJECT_INCLUDE,
        orderBy: { [query.sortBy ?? 'updatedAt']: query.sortOrder ?? 'desc' },
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.project.count({ where }),
    ]);

    const data = await this.withInsights(user.organizationId, projects);
    return this.pagination.build(data, total, page);
  }

  /** Portfolio-level counts for the projects page header and status tabs. */
  async summary(user: AuthenticatedUser) {
    const visible = this.access.visibleProjectsWhere(user);
    const active: Prisma.ProjectWhereInput = { ...visible, isArchived: false };
    const [total, archived, byStatus, lookups, members] = await Promise.all([
      this.prisma.project.count({ where: active }),
      this.prisma.project.count({ where: { ...visible, isArchived: true } }),
      this.prisma.project.groupBy({ by: ['statusId'], where: active, _count: { _all: true } }),
      this.prisma.lookup.findMany({ where: { organizationId: user.organizationId, type: LookupType.PROJECT_STATUS } }),
      this.prisma.projectMember.findMany({ where: { project: active }, distinct: ['userId'], select: { userId: true } }),
    ]);
    const projectIds = (await this.prisma.project.findMany({ where: active, select: { id: true } })).map((p) => p.id);
    const stats = await this.progress.forProjects(user.organizationId, projectIds);

    const byCategory = Object.fromEntries(Object.values(StatusCategory).map((category) => [category, 0])) as Record<StatusCategory, number>;
    for (const row of byStatus) {
      const category = lookups.find((l) => l.id === row.statusId)?.category as StatusCategory | undefined;
      if (category) byCategory[category] += row._count._all;
    }
    const projectsWithOverdue = [...stats.values()].filter((s) => s.overdueTasks > 0).length;
    const overdueTasks = [...stats.values()].reduce((sum, s) => sum + s.overdueTasks, 0);

    return { total, archived, byCategory, members: members.length, projectsWithOverdue, overdueTasks };
  }

  async navigation(user: AuthenticatedUser) {
    const projects = await this.prisma.project.findMany({
      where: { ...this.access.visibleProjectsWhere(user), isArchived: false },
      select: { id: true, name: true, key: true, color: true, favorites: { where: { userId: user.id }, select: { userId: true } } },
      orderBy: { name: 'asc' },
    });
    return projects.map(({ favorites, ...project }) => ({ ...project, isFavorite: favorites.length > 0 }));
  }

  async setFavorite(user: AuthenticatedUser, projectId: string, favorite: boolean): Promise<void> {
    await this.access.assertCanView(user, projectId);
    const key = { userId_projectId: { userId: user.id, projectId } };
    if (favorite) {
      await this.prisma.projectFavorite.upsert({ where: key, create: { userId: user.id, projectId }, update: {} });
    } else {
      await this.prisma.projectFavorite.deleteMany({ where: { userId: user.id, projectId } });
    }
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const access = await this.access.assertCanView(user, id);
    const [project, stats, favorite] = await Promise.all([
      this.prisma.project.findUniqueOrThrow({ where: { id }, include: PROJECT_INCLUDE }),
      this.progress.forProject(user.organizationId, id),
      this.prisma.projectFavorite.count({ where: { userId: user.id, projectId: id } }),
    ]);
    return {
      ...project,
      stats,
      isFavorite: favorite > 0,
      access: { role: access.memberRole, canEdit: access.canEdit, canManage: access.canManage },
    };
  }

  async create(user: AuthenticatedUser, dto: CreateProjectDto) {
    this.assertDateRange(dto.startDate, dto.endDate);
    const statusId = dto.statusId
      ? (await this.lookups.assertValid(user.organizationId, dto.statusId, LookupType.PROJECT_STATUS)).id
      : await this.lookups.getDefaultId(user.organizationId, LookupType.PROJECT_STATUS);
    // The root account works in an organization without being part of it: it must pick an owner
    // and is never added as a project member.
    const actingAsRoot = isRoot(user.role);
    if (actingAsRoot && !dto.ownerId) throw new BadRequestException('Choose a project owner from the organization');
    const ownerId = dto.ownerId ?? user.id;
    await this.assertOrgUsers(user.organizationId, [ownerId, ...(dto.memberIds ?? [])]);

    const memberIds = (dto.memberIds ?? []).filter((id) => id !== ownerId && id !== user.id);
    const leadIds = [...new Set(actingAsRoot ? [ownerId] : [ownerId, user.id])];

    const project = await this.prisma.project.create({
      data: {
        organizationId: user.organizationId,
        name: dto.name,
        key: dto.key,
        description: dto.description ?? null,
        color: dto.color ?? null,
        statusId,
        ownerId,
        startDate: dto.startDate ?? null,
        endDate: dto.endDate ?? null,
        budgetHours: dto.budgetHours ?? null,
        members: {
          create: [
            ...[...leadIds, ...memberIds].map((userId) => ({ userId, role: ProjectRole.MEMBER })),
          ],
        },
      },
      include: PROJECT_INCLUDE,
    });

    this.events.activity({
      organizationId: user.organizationId,
      projectId: project.id,
      actorId: user.id,
      entityType: EntityType.PROJECT,
      entityId: project.id,
      action: ActivityAction.CREATED,
      summary: `created project ${project.name}`,
    });
    this.events.notify({
      recipientIds: [...leadIds, ...memberIds],
      actorId: user.id,
      type: NotificationType.PROJECT_ADDED,
      title: `You were added to ${project.name}`,
      body: `${fullName(user)} added you to the project`,
      link: NotificationLinks.project(project.id),
    });
    return project;
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateProjectDto) {
    const { project } = await this.access.assertCanManage(user, id);
    this.assertDateRange(
      dto.startDate === undefined ? project.startDate : dto.startDate,
      dto.endDate === undefined ? project.endDate : dto.endDate,
    );
    if (dto.statusId) await this.lookups.assertValid(user.organizationId, dto.statusId, LookupType.PROJECT_STATUS);
    if (dto.ownerId) await this.assertOrgUsers(user.organizationId, [dto.ownerId]);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.ownerId && dto.ownerId !== project.ownerId) {
        await tx.projectMember.upsert({
          where: { projectId_userId: { projectId: id, userId: dto.ownerId } },
          create: { projectId: id, userId: dto.ownerId, role: ProjectRole.MEMBER },
          update: {},
        });
      }
      return tx.project.update({ where: { id }, data: dto, include: PROJECT_INCLUDE });
    });

    const statusChanged = dto.statusId && dto.statusId !== project.statusId;
    this.events.activity({
      organizationId: user.organizationId,
      projectId: id,
      actorId: user.id,
      entityType: EntityType.PROJECT,
      entityId: id,
      action: statusChanged ? ActivityAction.STATUS_CHANGED : ActivityAction.UPDATED,
      summary: statusChanged
        ? `changed project status to ${updated.status.name}`
        : dto.isArchived !== undefined && dto.isArchived !== project.isArchived
          ? `${dto.isArchived ? 'archived' : 'restored'} project ${updated.name}`
          : `updated project ${updated.name}`,
    });
    if (statusChanged) {
      const members = await this.prisma.projectMember.findMany({ where: { projectId: id, user: { isActive: true } }, select: { userId: true } });
      this.events.notify({
        recipientIds: [updated.ownerId, ...members.map((m) => m.userId)],
        actorId: user.id,
        type: NotificationType.PROJECT_STATUS_CHANGED,
        title: `${updated.name} is now ${updated.status.name}`,
        body: `${fullName(user)} changed the project status`,
        link: NotificationLinks.project(id),
      });
    }
    return updated;
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    await this.access.assertCanManage(user, id);
    await this.prisma.project.delete({ where: { id } });
  }

  // ─── Members ─────────────────────────────────────────────────

  async members(user: AuthenticatedUser, projectId: string) {
    await this.access.assertCanView(user, projectId);
    return this.prisma.projectMember.findMany({
      where: { projectId },
      include: { user: { select: { ...USER_SUMMARY_SELECT, jobTitle: true, isActive: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addMembers(user: AuthenticatedUser, projectId: string, dto: AddMembersDto) {
    const { project } = await this.access.assertCanManageWritable(user, projectId);
    await this.assertOrgUsers(user.organizationId, dto.userIds);

    const existing = await this.prisma.projectMember.findMany({
      where: { projectId, userId: { in: dto.userIds } },
      select: { userId: true },
    });
    const existingIds = new Set(existing.map((m) => m.userId));
    const newIds = dto.userIds.filter((id) => !existingIds.has(id));
    if (newIds.length) {
      await this.prisma.projectMember.createMany({
        data: newIds.map((userId) => ({ projectId, userId, role: ProjectRole.MEMBER })),
      });
      this.events.activity({
        organizationId: user.organizationId,
        projectId,
        actorId: user.id,
        entityType: EntityType.MEMBER,
        entityId: projectId,
        action: ActivityAction.JOINED,
        summary: `added ${newIds.length} member(s) to the project`,
      });
      this.events.notify({
        recipientIds: newIds,
        actorId: user.id,
        type: NotificationType.PROJECT_ADDED,
        title: `You were added to ${project.name}`,
        body: `${fullName(user)} added you to the project`,
        link: NotificationLinks.project(projectId),
      });
    }
    return this.members(user, projectId);
  }

  /** Everyone who could still be added to the project: active members of the organization and root admins. */
  async memberCandidates(user: AuthenticatedUser, projectId?: string) {
    if (projectId) await this.access.assertCanManageWritable(user, projectId);
    return this.prisma.user.findMany({
      where: { ...this.projectEligible(user.organizationId), ...(projectId ? { memberships: { none: { projectId } } } : {}) },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: { ...USER_SUMMARY_SELECT, role: true },
    });
  }

  async removeMember(user: AuthenticatedUser, projectId: string, userId: string): Promise<void> {
    const { project } = await this.access.assertCanManageWritable(user, projectId);
    if (userId === project.ownerId) {
      throw new BadRequestException('Transfer ownership before removing the project owner');
    }
    await this.findMembership(projectId, userId);
    await this.prisma.$transaction([
      this.prisma.taskAssignee.deleteMany({ where: { userId, task: { projectId } } }),
      this.prisma.issue.updateMany({ where: { projectId, assigneeId: userId }, data: { assigneeId: null } }),
      this.prisma.projectMember.delete({ where: { projectId_userId: { projectId, userId } } }),
    ]);
    this.events.activity({
      organizationId: user.organizationId,
      projectId,
      actorId: user.id,
      entityType: EntityType.MEMBER,
      entityId: userId,
      action: ActivityAction.LEFT,
      summary: `removed a member from the project`,
    });
    this.events.notify({
      recipientIds: [userId],
      actorId: user.id,
      type: NotificationType.PROJECT_REMOVED,
      title: `You were removed from ${project.name}`,
      body: `${fullName(user)} removed you from the project; your task and issue assignments there were cleared`,
      link: NotificationLinks.home(),
    });
  }

  // ─── Private ─────────────────────────────────────────────────

  /** Adds progress, logged hours and health to a page of projects (batched queries). */
  private async withInsights<T extends { id: string; endDate: Date | null; budgetHours: number | null; status: { category: string | null } }>(
    organizationId: string,
    projects: T[],
  ): Promise<(T & { stats: ProgressStats; loggedMinutes: number; health: string })[]> {
    const ids = projects.map((p) => p.id);
    const [stats, logged] = await Promise.all([
      this.progress.forProjects(organizationId, ids),
      ids.length
        ? this.prisma.timeEntry.groupBy({ by: ['projectId'], where: { projectId: { in: ids } }, _sum: { minutes: true } })
        : Promise.resolve([]),
    ]);
    const now = new Date();
    return projects.map((project) => {
      const projectStats = stats.get(project.id)!;
      const loggedMinutes = logged.find((row) => row.projectId === project.id)?._sum.minutes ?? 0;
      return {
        ...project,
        stats: projectStats,
        loggedMinutes,
        health: evaluateProjectHealth(
          {
            statusCategory: project.status.category,
            openTasks: projectStats.openTasks,
            overdueTasks: projectStats.overdueTasks,
            endDate: project.endDate,
            budgetHours: project.budgetHours,
            loggedMinutes,
          },
          now,
        ),
      };
    });
  }

  private async findMembership(projectId: string, userId: string) {
    const member = await this.prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
    if (!member) throw new NotFoundException('Member not found');
    return member;
  }

  /** Active people of the organization plus root admins (who belong to no organization but can join its projects). */
  private projectEligible(organizationId: string): Prisma.UserWhereInput {
    return { isActive: true, OR: [{ organizationId }, { role: PlatformRole.ROOT }] };
  }

  private async assertOrgUsers(organizationId: string, userIds: string[]): Promise<void> {
    const unique = [...new Set(userIds)];
    const count = await this.prisma.user.count({ where: { id: { in: unique }, ...this.projectEligible(organizationId) } });
    if (count !== unique.length) throw new BadRequestException('One or more users are invalid or inactive');
  }

  private assertDateRange(start?: Date | null, end?: Date | null): void {
    if (start && end && end < start) {
      throw new BadRequestException('End date must be on or after the start date');
    }
  }
}
