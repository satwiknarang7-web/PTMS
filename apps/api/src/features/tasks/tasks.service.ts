import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Task } from '@prisma/client';
import {
  ActivityAction,
  DependencyType,
  EntityType,
  LookupType,
  NotificationType,
  StatusCategory,
} from '../../common/constants/domain.constants';
import { NotificationLinks, TaskChangedEvent, TaskChangeKind } from '../../common/events/domain-events';
import { EventPublisher } from '../../common/events/event-publisher.service';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { OrgRole, PlatformRole } from '../../common/constants/roles.constants';
import { PaginationService } from '../../common/pagination/pagination.service';
import { fullName } from '../../common/utils/string.util';
import { PrismaService } from '../../prisma/prisma.service';
import { LookupsService } from '../lookups/lookups.service';
import { ProjectAccessService } from '../projects/project-access.service';
import { USER_SUMMARY_SELECT } from '../users/users.select';
import { AddDependencyDto, CreateTaskDto, MoveTaskDto, TaskQueryDto, UpdateTaskDto } from './dto/task.dto';
import { TASK_DETAIL_INCLUDE, TASK_LIST_INCLUDE } from './tasks.select';

/** Gap between consecutive board positions so cards can be inserted without renumbering. */
const POSITION_STEP = 1024;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly lookups: LookupsService,
    private readonly pagination: PaginationService,
    private readonly events: EventPublisher,
  ) {}

  async findAll(user: AuthenticatedUser, query: TaskQueryDto) {
    const page = this.pagination.resolve(query.page, query.limit);
    const where = await this.buildWhere(user, query);
    const sortBy = query.sortBy ?? 'position';
    const orderBy: Prisma.TaskOrderByWithRelationInput[] = [
      { [sortBy]: query.sortOrder ?? (sortBy === 'updatedAt' || sortBy === 'createdAt' ? 'desc' : 'asc') },
      { number: 'asc' },
    ];

    const [data, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({ where, include: TASK_LIST_INCLUDE, orderBy, skip: page.skip, take: page.take }),
      this.prisma.task.count({ where }),
    ]);
    return this.pagination.build(data.map(flattenAssignees), total, page);
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const task = await this.findVisible(user, id);
    const [detail, logged] = await Promise.all([
      this.prisma.task.findUniqueOrThrow({ where: { id: task.id }, include: TASK_DETAIL_INCLUDE }),
      this.prisma.timeEntry.aggregate({ where: { taskId: id }, _sum: { minutes: true } }),
    ]);
    return {
      ...flattenAssignees(detail),
      subtasks: detail.subtasks.map(flattenAssignees),
      loggedMinutes: logged._sum.minutes ?? 0,
    };
  }

  async create(user: AuthenticatedUser, dto: CreateTaskDto) {
    await this.access.assertCanEdit(user, dto.projectId);
    this.assertDateRange(dto.startDate, dto.dueDate);

    const statusId = dto.statusId
      ? (await this.lookups.assertValid(user.organizationId, dto.statusId, LookupType.TASK_STATUS)).id
      : await this.lookups.getDefaultId(user.organizationId, LookupType.TASK_STATUS);
    const priorityId = dto.priorityId
      ? (await this.lookups.assertValid(user.organizationId, dto.priorityId, LookupType.PRIORITY)).id
      : await this.lookups.getDefaultId(user.organizationId, LookupType.PRIORITY);
    await this.assertRelations(dto.projectId, dto);
    await this.access.assertMembers(dto.projectId, dto.assigneeIds ?? []);
    const closed = await this.isClosedStatus(user.organizationId, statusId);

    const task = await this.prisma.$transaction(async (tx) => {
      const { taskCounter } = await tx.project.update({
        where: { id: dto.projectId },
        data: { taskCounter: { increment: 1 } },
        select: { taskCounter: true },
      });
      const last = await tx.task.findFirst({ where: { projectId: dto.projectId, statusId }, orderBy: { position: 'desc' } });

      return tx.task.create({
        data: {
          projectId: dto.projectId,
          number: taskCounter,
          title: dto.title,
          description: dto.description ?? null,
          statusId,
          priorityId,
          taskListId: dto.taskListId ?? null,
          milestoneId: dto.milestoneId ?? null,
          parentId: dto.parentId ?? null,
          startDate: dto.startDate ?? null,
          dueDate: dto.dueDate ?? null,
          estimatedHours: dto.estimatedHours ?? null,
          progress: closed ? 100 : (dto.progress ?? 0),
          completedAt: closed ? new Date() : null,
          position: (last?.position ?? 0) + POSITION_STEP,
          createdById: user.id,
          assignees: { create: (dto.assigneeIds ?? []).map((userId) => ({ userId })) },
        },
        include: TASK_LIST_INCLUDE,
      });
    });

    this.recordActivity(user, task, ActivityAction.CREATED, `created task ${this.ref(task)} ${task.title}`);
    this.notifyAssignees(user, task, dto.assigneeIds ?? []);
    this.publishChange(user, task, 'created');
    if (dto.assigneeIds?.length) this.publishChange(user, task, 'assigned', { assigneeIds: dto.assigneeIds });
    return flattenAssignees(task);
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateTaskDto) {
    const existing = await this.findVisible(user, id);
    await this.access.assertCanEdit(user, existing.projectId);
    this.assertDateRange(
      dto.startDate === undefined ? existing.startDate : dto.startDate,
      dto.dueDate === undefined ? existing.dueDate : dto.dueDate,
    );
    if (dto.priorityId) await this.lookups.assertValid(user.organizationId, dto.priorityId, LookupType.PRIORITY);
    await this.assertRelations(existing.projectId, dto, existing.id);

    const data: Prisma.TaskUncheckedUpdateInput = {
      title: dto.title,
      description: dto.description,
      priorityId: dto.priorityId,
      taskListId: dto.taskListId,
      milestoneId: dto.milestoneId,
      parentId: dto.parentId,
      startDate: dto.startDate,
      dueDate: dto.dueDate,
      estimatedHours: dto.estimatedHours,
      progress: dto.progress,
    };
    if (dto.statusId && dto.statusId !== existing.statusId) {
      Object.assign(data, await this.statusTransition(user.organizationId, dto.statusId));
    }

    let addedAssignees: string[] = [];
    if (dto.assigneeIds) {
      await this.access.assertMembers(existing.projectId, dto.assigneeIds);
      const current = await this.prisma.taskAssignee.findMany({ where: { taskId: id }, select: { userId: true } });
      const currentIds = new Set(current.map((a) => a.userId));
      addedAssignees = dto.assigneeIds.filter((uid) => !currentIds.has(uid));
      data.assignees = {
        deleteMany: { userId: { notIn: dto.assigneeIds } },
        create: addedAssignees.map((userId) => ({ userId })),
      };
    }

    const task = await this.prisma.task.update({ where: { id }, data, include: TASK_LIST_INCLUDE });

    if (data.statusId) {
      this.recordActivity(user, task, ActivityAction.STATUS_CHANGED, `moved ${this.ref(task)} to ${task.status.name}`);
      await this.notifyStatusChange(user, task);
    } else {
      this.recordActivity(user, task, ActivityAction.UPDATED, `updated task ${this.ref(task)} ${task.title}`);
    }
    this.notifyAssignees(user, task, addedAssignees);
    if (dto.dueDate !== undefined && dto.dueDate?.getTime() !== existing.dueDate?.getTime()) {
      // Newly added assignees already got the assignment notice with the new date.
      this.notifyDueDateChange(user, task, addedAssignees);
    }
    if (data.statusId) this.publishChange(user, task, 'status_changed', { statusId: task.statusId });
    if (dto.priorityId && dto.priorityId !== existing.priorityId) this.publishChange(user, task, 'priority_changed', { priorityId: task.priorityId });
    if (addedAssignees.length) this.publishChange(user, task, 'assigned', { assigneeIds: addedAssignees });
    return flattenAssignees(task);
  }

  /** Board drag & drop: changes status and/or ordering in one call. */
  async move(user: AuthenticatedUser, id: string, dto: MoveTaskDto) {
    const existing = await this.findVisible(user, id);
    await this.access.assertCanEdit(user, existing.projectId);
    const data: Prisma.TaskUncheckedUpdateInput = { position: dto.position };
    if (dto.statusId !== existing.statusId) {
      Object.assign(data, await this.statusTransition(user.organizationId, dto.statusId));
    }
    const task = await this.prisma.task.update({ where: { id }, data, include: TASK_LIST_INCLUDE });
    if (data.statusId) {
      this.recordActivity(user, task, ActivityAction.STATUS_CHANGED, `moved ${this.ref(task)} to ${task.status.name}`);
      await this.notifyStatusChange(user, task);
      this.publishChange(user, task, 'status_changed', { statusId: task.statusId });
    }
    return flattenAssignees(task);
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    const task = await this.findVisible(user, id);
    await this.access.assertCanEdit(user, task.projectId);
    await this.prisma.task.delete({ where: { id } });
    this.recordActivity(user, task, ActivityAction.DELETED, `deleted task ${this.ref(task)} ${task.title}`);
  }

  // ─── Dependencies ────────────────────────────────────────────

  async addDependency(user: AuthenticatedUser, id: string, dto: AddDependencyDto) {
    const successor = await this.findVisible(user, id);
    await this.access.assertCanEdit(user, successor.projectId);
    if (dto.predecessorId === id) throw new BadRequestException('A task cannot depend on itself');

    const predecessor = await this.prisma.task.findFirst({
      where: { id: dto.predecessorId, projectId: successor.projectId },
    });
    if (!predecessor) throw new BadRequestException('Dependencies must be within the same project');
    if (await this.reachable(id, dto.predecessorId)) {
      throw new BadRequestException('This dependency would create a circular chain');
    }

    return this.prisma.taskDependency.create({
      data: { predecessorId: dto.predecessorId, successorId: id, type: dto.type ?? DependencyType.FINISH_TO_START },
    });
  }

  async removeDependency(user: AuthenticatedUser, id: string, dependencyId: string): Promise<void> {
    const task = await this.findVisible(user, id);
    await this.access.assertCanEdit(user, task.projectId);
    const { count } = await this.prisma.taskDependency.deleteMany({
      where: { id: dependencyId, OR: [{ successorId: id }, { predecessorId: id }] },
    });
    if (!count) throw new NotFoundException('Dependency not found');
  }

  // ─── Gantt ───────────────────────────────────────────────────

  async gantt(user: AuthenticatedUser, projectId: string) {
    const { project } = await this.access.assertCanView(user, projectId);
    const [tasks, milestones, dependencies] = await Promise.all([
      this.prisma.task.findMany({
        where: { projectId },
        select: {
          id: true,
          number: true,
          title: true,
          parentId: true,
          milestoneId: true,
          taskListId: true,
          startDate: true,
          dueDate: true,
          progress: true,
          status: { select: { id: true, name: true, color: true, category: true } },
          priority: { select: { id: true, name: true, color: true } },
          assignees: { select: { user: { select: USER_SUMMARY_SELECT } } },
        },
        orderBy: [{ startDate: 'asc' }, { number: 'asc' }],
      }),
      this.prisma.milestone.findMany({ where: { projectId }, orderBy: { dueDate: 'asc' } }),
      this.prisma.taskDependency.findMany({ where: { successor: { projectId } } }),
    ]);
    return {
      project: { id: project.id, name: project.name, key: project.key, startDate: project.startDate, endDate: project.endDate },
      tasks: tasks.map(flattenAssignees),
      milestones,
      dependencies,
    };
  }

  // ─── Private helpers ─────────────────────────────────────────

  private async buildWhere(user: AuthenticatedUser, query: TaskQueryDto): Promise<Prisma.TaskWhereInput> {
    const and: Prisma.TaskWhereInput[] = [{ project: this.access.visibleProjectsWhere(user) }];
    if (query.projectId) and.push({ projectId: query.projectId });
    if (query.statusId) and.push({ statusId: query.statusId });
    if (query.priorityId) and.push({ priorityId: query.priorityId });
    if (query.milestoneId) and.push({ milestoneId: query.milestoneId });
    if (query.taskListId) and.push({ taskListId: query.taskListId });
    if (query.parentId) and.push({ parentId: query.parentId });
    if (query.rootOnly) and.push({ parentId: null });
    if (query.assigneeId) and.push({ assignees: { some: { userId: query.assigneeId } } });
    if (query.mine) and.push({ assignees: { some: { userId: user.id } } });
    if (query.statusCategory) and.push({ status: { category: query.statusCategory } });
    if (query.dueFrom) and.push({ dueDate: { gte: query.dueFrom } });
    if (query.dueTo) and.push({ dueDate: { lte: query.dueTo } });
    if (query.overdue) {
      and.push({ dueDate: { lt: new Date() } }, { status: { category: { not: StatusCategory.CLOSED } } });
    }
    if (query.search) {
      const number = Number(query.search.replace(/^[A-Z]+-/i, ''));
      and.push({
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
          ...(Number.isInteger(number) && number > 0 ? [{ number }] : []),
        ],
      });
    }
    return { AND: and };
  }

  private async findVisible(user: AuthenticatedUser, id: string): Promise<Task & { project: { key: string } }> {
    const task = await this.prisma.task.findFirst({
      where: { id, project: this.access.visibleProjectsWhere(user) },
      include: { project: { select: { key: true } } },
    });
    if (!task) throw new NotFoundException('Task not found');
    return task;
  }

  private async isClosedStatus(organizationId: string, statusId: string): Promise<boolean> {
    const status = await this.lookups.assertValid(organizationId, statusId, LookupType.TASK_STATUS);
    return status.category === StatusCategory.CLOSED;
  }

  private async statusTransition(organizationId: string, statusId: string): Promise<Prisma.TaskUncheckedUpdateInput> {
    const closed = await this.isClosedStatus(organizationId, statusId);
    return closed ? { statusId, completedAt: new Date(), progress: 100 } : { statusId, completedAt: null };
  }

  private async assertRelations(
    projectId: string,
    dto: Pick<UpdateTaskDto, 'taskListId' | 'milestoneId' | 'parentId'>,
    taskId?: string,
  ): Promise<void> {
    const checks: Promise<void>[] = [];
    if (dto.taskListId) {
      checks.push(
        this.prisma.taskList.count({ where: { id: dto.taskListId, projectId } }).then((n) => {
          if (!n) throw new BadRequestException('Task list does not belong to this project');
        }),
      );
    }
    if (dto.milestoneId) {
      checks.push(
        this.prisma.milestone.count({ where: { id: dto.milestoneId, projectId } }).then((n) => {
          if (!n) throw new BadRequestException('Milestone does not belong to this project');
        }),
      );
    }
    if (dto.parentId) {
      checks.push(
        (async () => {
          if (dto.parentId === taskId) throw new BadRequestException('A task cannot be its own parent');
          const parent = await this.prisma.task.findFirst({ where: { id: dto.parentId!, projectId } });
          if (!parent) throw new BadRequestException('Parent task does not belong to this project');
          if (taskId && (await this.isDescendant(dto.parentId!, taskId))) {
            throw new BadRequestException('A task cannot be moved under its own subtask');
          }
        })(),
      );
    }
    await Promise.all(checks);
  }

  /** True when `candidateId` sits somewhere below `ancestorId` in the subtask tree. */
  private async isDescendant(candidateId: string, ancestorId: string): Promise<boolean> {
    let current: string | null = candidateId;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      if (current === ancestorId) return true;
      seen.add(current);
      const row: { parentId: string | null } | null = await this.prisma.task.findUnique({
        where: { id: current },
        select: { parentId: true },
      });
      current = row?.parentId ?? null;
    }
    return false;
  }

  /** Breadth-first walk over successors to detect dependency cycles. */
  private async reachable(fromId: string, targetId: string): Promise<boolean> {
    const queue = [fromId];
    const seen = new Set<string>();
    while (queue.length) {
      const batch = queue.splice(0, queue.length).filter((id) => !seen.has(id));
      if (!batch.length) break;
      batch.forEach((id) => seen.add(id));
      const edges = await this.prisma.taskDependency.findMany({
        where: { predecessorId: { in: batch } },
        select: { successorId: true },
      });
      for (const { successorId } of edges) {
        if (successorId === targetId) return true;
        queue.push(successorId);
      }
    }
    return false;
  }

  private assertDateRange(start?: Date | null, due?: Date | null): void {
    if (start && due && due < start) {
      throw new BadRequestException('Due date must be on or after the start date');
    }
  }

  /** Lets automations react to the change. */
  private publishChange(user: AuthenticatedUser, task: Pick<Task, 'id' | 'projectId'>, kind: TaskChangeKind, details: Partial<TaskChangedEvent> = {}): void {
    this.events.taskChanged({ organizationId: user.organizationId, projectId: task.projectId, taskId: task.id, actorId: user.id, kind, ...details });
  }

  private ref(task: { number: number; project?: { key: string } }): string {
    return task.project ? `${task.project.key}-${task.number}` : `#${task.number}`;
  }

  private recordActivity(
    user: AuthenticatedUser,
    task: Pick<Task, 'id' | 'projectId' | 'number'> & { project?: { key: string } },
    action: ActivityAction,
    summary: string,
  ): void {
    this.events.activity({
      organizationId: user.organizationId,
      projectId: task.projectId,
      actorId: user.id,
      entityType: EntityType.TASK,
      entityId: task.id,
      action,
      summary,
    });
  }

  /**
   * The task's creator and assignees follow its progress, and so do the people running the project:
   * its owner and the coordinators (and root admins) on it, whoever made the change.
   */
  private async notifyStatusChange(user: AuthenticatedUser, task: NotifiableTask & { createdById: string; status: { name: string } }): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: task.projectId },
      select: {
        ownerId: true,
        members: { where: { user: { isActive: true, role: { in: [OrgRole.PROJECT_COORDINATOR, PlatformRole.ROOT] } } }, select: { userId: true } },
      },
    });
    this.events.notify({
      recipientIds: [
        task.createdById,
        ...task.assignees.map((a) => a.user.id),
        ...(project ? [project.ownerId, ...project.members.map((m) => m.userId)] : []),
      ],
      actorId: user.id,
      type: NotificationType.TASK_STATUS_CHANGED,
      title: `${this.ref(task)} moved to ${task.status.name}`,
      body: `${fullName(user)} changed the status of "${task.title}"`,
      link: NotificationLinks.task(task.projectId, task.id),
    });
  }

  private notifyDueDateChange(user: AuthenticatedUser, task: NotifiableTask & { dueDate: Date | null }, skipIds: string[]): void {
    const due = task.dueDate ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(task.dueDate) : null;
    this.events.notify({
      recipientIds: task.assignees.map((a) => a.user.id).filter((id) => !skipIds.includes(id)),
      actorId: user.id,
      type: NotificationType.TASK_DUE_DATE_CHANGED,
      title: due ? `${this.ref(task)} is now due ${due}` : `${this.ref(task)} no longer has a due date`,
      body: `${fullName(user)} changed the due date of "${task.title}"`,
      link: NotificationLinks.task(task.projectId, task.id),
    });
  }

  private notifyAssignees(
    user: AuthenticatedUser,
    task: Pick<Task, 'id' | 'projectId' | 'number' | 'title'> & { project: { key: string } },
    recipientIds: string[],
  ): void {
    this.events.notify({
      recipientIds,
      actorId: user.id,
      type: NotificationType.TASK_ASSIGNED,
      title: `${this.ref(task)} assigned to you`,
      body: `${fullName(user)} assigned you "${task.title}"`,
      link: NotificationLinks.task(task.projectId, task.id),
    });
  }
}

type NotifiableTask = Pick<Task, 'id' | 'projectId' | 'number' | 'title'> & { project: { key: string }; assignees: { user: { id: string } }[] };

/** Converts the join-table shape `{ assignees: [{ user }] }` into `{ assignees: [user] }`. */
function flattenAssignees<T extends { assignees: { user: unknown }[] }>(task: T) {
  return { ...task, assignees: task.assignees.map((a) => a.user as T['assignees'][number]['user']) };
}
