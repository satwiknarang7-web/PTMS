import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { hasPermission, Permission } from '../../common/constants/permissions.constants';
import { normalizeRole, OrgRole, ProjectRole } from '../../common/constants/roles.constants';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { Paginated, PaginationService } from '../../common/pagination/pagination.service';
import { StatusCategory } from '../../common/constants/domain.constants';
import { addDays, overdueCutoff, startOfWeekUtc, todayInTimezone } from '../../common/utils/date.util';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ChangePasswordDto,
  CreateUserDto,
  UpdateProfileDto,
  UpdateUserDto,
  UserQueryDto,
} from './dto/user.dto';
import { PasswordService } from './password.service';
import { PublicUser, USER_DIRECTORY_SELECT, USER_PUBLIC_SELECT, USER_SUMMARY_SELECT } from './users.select';

/** Open tasks / issues listed on a member's details page. */
const DETAILS_LIST_SIZE = 50;
const DETAILS_RECENT_SIZE = 15;
/** Window for the "last 30 days" figures. */
const DETAILS_WINDOW_DAYS = 30;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly pagination: PaginationService,
  ) {}

  /** `fullView` (coordinators and root) includes pay rates and sign-in activity. */
  async findAll(organizationId: string, query: UserQueryDto, fullView = true): Promise<Paginated<Partial<PublicUser>>> {
    const page = this.pagination.resolve(query.page, query.limit);
    const where: Prisma.UserWhereInput = {
      organizationId,
      ...(query.role ? { role: query.role } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { firstName: { contains: query.search, mode: 'insensitive' } },
              { lastName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { jobTitle: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: fullView ? USER_PUBLIC_SELECT : USER_DIRECTORY_SELECT,
        orderBy: [{ firstName: query.sortOrder ?? 'asc' }, { lastName: 'asc' }],
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.user.count({ where }),
    ]);
    return this.pagination.build(data, total, page);
  }

  async findOne(organizationId: string, id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findFirst({ where: { id, organizationId }, select: USER_PUBLIC_SELECT });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** One colleague as members may see them (see USER_DIRECTORY_SELECT). */
  async findDirectoryEntry(organizationId: string, id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, organizationId }, select: USER_DIRECTORY_SELECT });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** Everything a coordinator needs to know about one person: projects, open work, time and activity. */
  async details(organizationId: string, id: string) {
    const user = await this.findOne(organizationId, id);
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { weekStartsOn: true, timezone: true },
    });
    const now = new Date();
    const today = todayInTimezone(organization.timezone, now);
    const weekStart = startOfWeekUtc(today, organization.weekStartsOn);
    const monthAgo = addDays(today, -DETAILS_WINDOW_DAYS);
    // Time logged ahead of today does not count towards "this week" / "last 30 days" yet.
    const endOfToday = addDays(today, 1);
    const openStatus: Prisma.LookupWhereInput = { OR: [{ category: null }, { category: { not: StatusCategory.CLOSED } }] };
    const assigned: Prisma.TaskWhereInput = { assignees: { some: { userId: id } }, project: { organizationId, isArchived: false } };
    const openIssues: Prisma.IssueWhereInput = { assigneeId: id, project: { organizationId, isArchived: false }, status: openStatus };
    const lookup = { select: { id: true, name: true, color: true, category: true } };

    const [memberships, tasks, issues, reportedIssues, completedTasks, weekTime, monthTime, recentTime, activity, overdueTasks, openIssueCount] = await Promise.all([
      this.prisma.projectMember.findMany({
        where: { userId: id, project: { organizationId } },
        orderBy: { createdAt: 'asc' },
        select: {
          createdAt: true,
          project: { select: { id: true, name: true, key: true, color: true, isArchived: true, endDate: true, status: lookup } },
        },
      }),
      this.prisma.task.findMany({
        where: { ...assigned, status: openStatus },
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        take: DETAILS_LIST_SIZE,
        select: {
          id: true,
          number: true,
          title: true,
          dueDate: true,
          progress: true,
          estimatedHours: true,
          status: lookup,
          priority: lookup,
          project: { select: { id: true, name: true, key: true, color: true } },
        },
      }),
      this.prisma.issue.findMany({
        where: openIssues,
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        take: DETAILS_LIST_SIZE,
        select: {
          id: true,
          number: true,
          title: true,
          dueDate: true,
          status: lookup,
          severity: lookup,
          project: { select: { id: true, name: true, key: true, color: true } },
        },
      }),
      // Issues they reported, newest first (open or closed), so coordinators can follow up on them.
      this.prisma.issue.findMany({
        where: { reporterId: id, project: { organizationId } },
        orderBy: { createdAt: 'desc' },
        take: DETAILS_LIST_SIZE,
        select: {
          id: true,
          number: true,
          title: true,
          createdAt: true,
          status: lookup,
          severity: lookup,
          assignee: { select: USER_SUMMARY_SELECT },
          project: { select: { id: true, name: true, key: true, color: true } },
        },
      }),
      this.prisma.task.count({ where: { ...assigned, completedAt: { gte: monthAgo } } }),
      this.prisma.timeEntry.aggregate({ where: { userId: id, date: { gte: weekStart, lt: endOfToday } }, _sum: { minutes: true } }),
      this.prisma.timeEntry.aggregate({ where: { userId: id, date: { gte: monthAgo, lt: endOfToday } }, _sum: { minutes: true } }),
      this.prisma.timeEntry.findMany({
        where: { userId: id, project: { organizationId } },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: DETAILS_RECENT_SIZE,
        select: { id: true, date: true, minutes: true, notes: true, approvalStatus: true, project: { select: { id: true, name: true, key: true, color: true } } },
      }),
      this.prisma.activity.findMany({
        where: { actorId: id, organizationId },
        orderBy: { createdAt: 'desc' },
        take: DETAILS_RECENT_SIZE,
        select: { id: true, summary: true, createdAt: true, project: { select: { id: true, name: true } } },
      }),
      // Counted separately: the lists above are capped at DETAILS_LIST_SIZE.
      this.prisma.task.count({ where: { ...assigned, status: openStatus, dueDate: { lt: overdueCutoff(organization.timezone, now) } } }),
      this.prisma.issue.count({ where: openIssues }),
    ]);

    const openTaskCounts = await this.prisma.task.groupBy({
      by: ['projectId'],
      where: { ...assigned, status: openStatus },
      _count: { _all: true },
    });
    const openByProject = new Map(openTaskCounts.map((row) => [row.projectId, row._count._all]));

    return {
      user,
      stats: {
        projects: memberships.filter((m) => !m.project.isArchived).length,
        openTasks: [...openByProject.values()].reduce((sum, count) => sum + count, 0),
        overdueTasks,
        completedTasks30d: completedTasks,
        openIssues: openIssueCount,
        minutesThisWeek: weekTime._sum.minutes ?? 0,
        minutes30d: monthTime._sum.minutes ?? 0,
      },
      projects: memberships.map(({ project, createdAt }) => ({ ...project, joinedAt: createdAt, openTasks: openByProject.get(project.id) ?? 0 })),
      tasks,
      issues,
      reportedIssues,
      recentTime,
      activity,
    };
  }

  async create(actor: AuthenticatedUser, dto: CreateUserDto): Promise<PublicUser> {
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('A user with this email already exists');
    }
    this.assertCanAssignRole(actor, dto.role);

    return this.prisma.user.create({
      data: {
        organizationId: actor.organizationId,
        email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        jobTitle: dto.jobTitle ?? null,
        hourlyRate: dto.hourlyRate ?? null,
        role: dto.role,
        passwordHash: await this.passwords.hash(dto.password),
      },
      select: USER_PUBLIC_SELECT,
    });
  }


  async update(actor: AuthenticatedUser, id: string, dto: UpdateUserDto): Promise<PublicUser> {
    const target = await this.findOne(actor.organizationId, id);

    if (target.id === actor.id && (dto.role !== undefined || dto.isActive === false)) {
      throw new BadRequestException('You cannot change your own role or deactivate yourself');
    }
    this.assertCanManage(actor, target.role);
    if (dto.role) this.assertCanAssignRole(actor, dto.role);

    const user = await this.prisma.user.update({ where: { id }, data: dto, select: USER_PUBLIC_SELECT });
    if (dto.isActive === false) {
      await this.revokeSessions(id);
    }
    return user;
  }

  async resetPassword(actor: AuthenticatedUser, id: string, password: string): Promise<void> {
    const target = await this.findOne(actor.organizationId, id);
    this.assertCanManage(actor, target.role);
    await this.prisma.user.update({ where: { id }, data: { passwordHash: await this.passwords.hash(password) } });
    await this.revokeSessions(id);
  }

  /** Clears someone's authenticator app (lost phone); they set it up again at their next sign-in. */
  async resetTwoFactor(actor: AuthenticatedUser, id: string): Promise<void> {
    const target = await this.findOne(actor.organizationId, id);
    this.assertCanManage(actor, target.role);
    await this.prisma.user.update({ where: { id }, data: { twoFactorSecret: null, twoFactorEnabledAt: null, twoFactorRecoveryCodes: null, twoFactorLastStep: null } });
    await this.revokeSessions(id);
  }

  updateProfile(userId: string, dto: UpdateProfileDto): Promise<PublicUser> {
    return this.prisma.user.update({ where: { id: userId }, data: dto, select: USER_PUBLIC_SELECT });
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await this.passwords.verify(dto.currentPassword, user.passwordHash))) {
      // Not 401: that status means "session expired" to clients, which would sign the user out.
      throw new BadRequestException('Current password is incorrect');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must differ from the current one');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await this.passwords.hash(dto.newPassword) },
    });
    await this.revokeSessions(userId);
  }

  /**
   * Permanently removes a person from an organization. Projects they own, tasks they created,
   * issues they reported, meetings they scheduled and automations they set up are handed over to
   * `transferToId` (or the first other active coordinator); their comments, time entries and
   * activity are deleted with the account. Callers decide who may do this (root admins).
   */
  async remove(organizationId: string, actorId: string, id: string, transferToId?: string): Promise<void> {
    if (id === actorId) throw new BadRequestException('You cannot remove yourself');
    const target = await this.prisma.user.findFirst({ where: { id, organizationId }, select: { id: true } });
    if (!target) throw new NotFoundException('User not found');

    const heirId = await this.resolveHeir(organizationId, id, actorId, transferToId);
    const owned = await this.prisma.project.findMany({ where: { ownerId: id }, select: { id: true } });

    await this.prisma.$transaction([
      this.prisma.project.updateMany({ where: { ownerId: id }, data: { ownerId: heirId } }),
      // The new owner must be able to open the projects handed to them.
      this.prisma.projectMember.createMany({
        data: owned.map((project) => ({ projectId: project.id, userId: heirId, role: ProjectRole.MEMBER })),
        skipDuplicates: true,
      }),
      this.prisma.task.updateMany({ where: { createdById: id }, data: { createdById: heirId } }),
      this.prisma.issue.updateMany({ where: { reporterId: id }, data: { reporterId: heirId } }),
      this.prisma.meeting.updateMany({ where: { createdById: id }, data: { createdById: heirId } }),
      this.prisma.automation.updateMany({ where: { createdById: id }, data: { createdById: heirId } }),
      this.prisma.user.delete({ where: { id } }),
    ]);
  }

  /** Who inherits a removed person's projects and records. */
  private async resolveHeir(organizationId: string, removedId: string, actorId: string, transferToId?: string): Promise<string> {
    if (transferToId) {
      if (transferToId === removedId) throw new BadRequestException('Choose someone else to hand their work over to');
      const heir = await this.prisma.user.findFirst({ where: { id: transferToId, organizationId, isActive: true }, select: { id: true } });
      if (!heir) throw new BadRequestException('The person to hand work over to must be an active member of this organization');
      return heir.id;
    }
    const coordinator = await this.prisma.user.findFirst({
      where: { organizationId, isActive: true, role: OrgRole.PROJECT_COORDINATOR, id: { not: removedId } },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    // Root admins are not part of the organization but can still own its records.
    return coordinator?.id ?? actorId;
  }

  private revokeSessions(userId: string) {
    return this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Coordinators manage member accounts; only root may change a coordinator. */
  private assertCanManage(actor: AuthenticatedUser, targetRole: string): void {
    if (normalizeRole(targetRole) === OrgRole.PROJECT_COORDINATOR && !hasPermission(actor.role, Permission.COORDINATORS_MANAGE)) {
      throw new ForbiddenException('Only the root account can change a project coordinator');
    }
  }

  private assertCanAssignRole(actor: AuthenticatedUser, role: string): void {
    if (role === OrgRole.PROJECT_COORDINATOR && !hasPermission(actor.role, Permission.COORDINATORS_MANAGE)) {
      throw new ForbiddenException('Only the root account can appoint a project coordinator');
    }
  }
}
