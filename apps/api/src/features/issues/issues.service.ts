import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Issue, Prisma } from '@prisma/client';
import {
  ActivityAction,
  EntityType,
  LookupType,
  NotificationType,
  StatusCategory,
} from '../../common/constants/domain.constants';
import { NotificationLinks } from '../../common/events/domain-events';
import { EventPublisher } from '../../common/events/event-publisher.service';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { PaginationService } from '../../common/pagination/pagination.service';
import { fullName } from '../../common/utils/string.util';
import { PrismaService } from '../../prisma/prisma.service';
import { LookupsService } from '../lookups/lookups.service';
import { ProjectAccessService } from '../projects/project-access.service';
import { USER_SUMMARY_SELECT } from '../users/users.select';
import { CreateIssueDto, IssueQueryDto, UpdateIssueDto } from './dto/issue.dto';

const LOOKUP_SELECT = { id: true, name: true, color: true, category: true } satisfies Prisma.LookupSelect;

const ISSUE_INCLUDE = {
  status: { select: LOOKUP_SELECT },
  priority: { select: LOOKUP_SELECT },
  severity: { select: LOOKUP_SELECT },
  reporter: { select: USER_SUMMARY_SELECT },
  assignee: { select: USER_SUMMARY_SELECT },
  milestone: { select: { id: true, name: true } },
  task: { select: { id: true, number: true, title: true } },
  project: { select: { id: true, name: true, key: true, color: true } },
  _count: { select: { comments: true } },
} satisfies Prisma.IssueInclude;

@Injectable()
export class IssuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly lookups: LookupsService,
    private readonly pagination: PaginationService,
    private readonly events: EventPublisher,
  ) {}

  async findAll(user: AuthenticatedUser, query: IssueQueryDto) {
    const page = this.pagination.resolve(query.page, query.limit);
    const and: Prisma.IssueWhereInput[] = [{ project: this.access.visibleProjectsWhere(user) }];
    if (query.projectId) and.push({ projectId: query.projectId });
    if (query.statusId) and.push({ statusId: query.statusId });
    if (query.priorityId) and.push({ priorityId: query.priorityId });
    if (query.severityId) and.push({ severityId: query.severityId });
    if (query.assigneeId) and.push({ assigneeId: query.assigneeId });
    if (query.reporterId) and.push({ reporterId: query.reporterId });
    if (query.milestoneId) and.push({ milestoneId: query.milestoneId });
    if (query.mine) and.push({ assigneeId: user.id });
    if (query.statusCategory) and.push({ status: { category: query.statusCategory } });
    if (query.search) {
      const number = Number(query.search.replace(/^[A-Z]+-/i, ''));
      and.push({
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          ...(Number.isInteger(number) && number > 0 ? [{ number }] : []),
        ],
      });
    }
    const where: Prisma.IssueWhereInput = { AND: and };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.issue.findMany({
        where,
        include: ISSUE_INCLUDE,
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortOrder ?? 'desc' },
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.issue.count({ where }),
    ]);
    return this.pagination.build(data, total, page);
  }

  async findOne(user: AuthenticatedUser, id: string) {
    const issue = await this.findVisible(user, id);
    return this.prisma.issue.findUniqueOrThrow({ where: { id: issue.id }, include: ISSUE_INCLUDE });
  }

  async create(user: AuthenticatedUser, dto: CreateIssueDto) {
    await this.access.assertCanEdit(user, dto.projectId);
    const org = user.organizationId;
    const [statusId, priorityId, severityId] = await Promise.all([
      this.resolveLookup(org, LookupType.ISSUE_STATUS, dto.statusId),
      this.resolveLookup(org, LookupType.PRIORITY, dto.priorityId),
      this.resolveLookup(org, LookupType.ISSUE_SEVERITY, dto.severityId),
    ]);
    await this.assertRelations(dto.projectId, dto);
    const resolved = await this.isClosed(org, statusId);

    const issue = await this.prisma.$transaction(async (tx) => {
      const { issueCounter } = await tx.project.update({
        where: { id: dto.projectId },
        data: { issueCounter: { increment: 1 } },
        select: { issueCounter: true },
      });
      return tx.issue.create({
        data: {
          projectId: dto.projectId,
          number: issueCounter,
          title: dto.title,
          description: dto.description ?? null,
          statusId,
          priorityId,
          severityId,
          reporterId: user.id,
          assigneeId: dto.assigneeId ?? null,
          milestoneId: dto.milestoneId ?? null,
          taskId: dto.taskId ?? null,
          dueDate: dto.dueDate ?? null,
          resolvedAt: resolved ? new Date() : null,
        },
        include: ISSUE_INCLUDE,
      });
    });

    this.recordActivity(user, issue, ActivityAction.CREATED, `reported issue ${this.ref(issue)} ${issue.title}`);
    if (issue.assigneeId) this.notifyAssignee(user, issue, issue.assigneeId);
    return issue;
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateIssueDto) {
    const existing = await this.findVisible(user, id);
    await this.access.assertCanEdit(user, existing.projectId);
    const org = user.organizationId;
    if (dto.priorityId) await this.lookups.assertValid(org, dto.priorityId, LookupType.PRIORITY);
    if (dto.severityId) await this.lookups.assertValid(org, dto.severityId, LookupType.ISSUE_SEVERITY);
    await this.assertRelations(existing.projectId, dto);

    const data: Prisma.IssueUncheckedUpdateInput = { ...dto };
    const statusChanged = dto.statusId && dto.statusId !== existing.statusId;
    if (statusChanged) {
      await this.lookups.assertValid(org, dto.statusId!, LookupType.ISSUE_STATUS);
      data.resolvedAt = (await this.isClosed(org, dto.statusId!)) ? new Date() : null;
    }

    const issue = await this.prisma.issue.update({ where: { id }, data, include: ISSUE_INCLUDE });
    this.recordActivity(
      user,
      issue,
      statusChanged ? ActivityAction.STATUS_CHANGED : ActivityAction.UPDATED,
      statusChanged ? `moved issue ${this.ref(issue)} to ${issue.status.name}` : `updated issue ${this.ref(issue)}`,
    );
    if (dto.assigneeId && dto.assigneeId !== existing.assigneeId) {
      this.notifyAssignee(user, issue, dto.assigneeId);
    }
    if (statusChanged) {
      this.events.notify({
        recipientIds: [issue.reporterId, ...(issue.assigneeId ? [issue.assigneeId] : [])],
        actorId: user.id,
        type: NotificationType.ISSUE_STATUS_CHANGED,
        title: `${this.ref(issue)} moved to ${issue.status.name}`,
        body: `${fullName(user)} changed the status of "${issue.title}"`,
        link: NotificationLinks.issue(issue.projectId, issue.id),
      });
    }
    return issue;
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    const issue = await this.findVisible(user, id);
    await this.access.assertCanEdit(user, issue.projectId);
    await this.prisma.issue.delete({ where: { id } });
    this.recordActivity(user, issue, ActivityAction.DELETED, `deleted issue ${this.ref(issue)} ${issue.title}`);
  }

  private async findVisible(user: AuthenticatedUser, id: string) {
    const issue = await this.prisma.issue.findFirst({
      where: { id, project: this.access.visibleProjectsWhere(user) },
      include: { project: { select: { key: true } } },
    });
    if (!issue) throw new NotFoundException('Issue not found');
    return issue;
  }

  private async resolveLookup(organizationId: string, type: LookupType, id?: string): Promise<string> {
    return id
      ? (await this.lookups.assertValid(organizationId, id, type)).id
      : this.lookups.getDefaultId(organizationId, type);
  }

  private async isClosed(organizationId: string, statusId: string): Promise<boolean> {
    const status = await this.lookups.assertValid(organizationId, statusId, LookupType.ISSUE_STATUS);
    return status.category === StatusCategory.CLOSED;
  }

  private async assertRelations(
    projectId: string,
    dto: Pick<UpdateIssueDto, 'assigneeId' | 'milestoneId' | 'taskId'>,
  ): Promise<void> {
    if (dto.assigneeId) await this.access.assertMembers(projectId, [dto.assigneeId]);
    if (dto.milestoneId && !(await this.prisma.milestone.count({ where: { id: dto.milestoneId, projectId } }))) {
      throw new BadRequestException('Milestone does not belong to this project');
    }
    if (dto.taskId && !(await this.prisma.task.count({ where: { id: dto.taskId, projectId } }))) {
      throw new BadRequestException('Task does not belong to this project');
    }
  }

  private ref(issue: Pick<Issue, 'number'> & { project: { key: string } }): string {
    return `${issue.project.key}-BUG-${issue.number}`;
  }

  private recordActivity(user: AuthenticatedUser, issue: Issue, action: ActivityAction, summary: string): void {
    this.events.activity({
      organizationId: user.organizationId,
      projectId: issue.projectId,
      actorId: user.id,
      entityType: EntityType.ISSUE,
      entityId: issue.id,
      action,
      summary,
    });
  }

  private notifyAssignee(
    user: AuthenticatedUser,
    issue: Issue & { project: { key: string } },
    assigneeId: string,
  ): void {
    this.events.notify({
      recipientIds: [assigneeId],
      actorId: user.id,
      type: NotificationType.ISSUE_ASSIGNED,
      title: `${this.ref(issue)} assigned to you`,
      body: `${fullName(user)} assigned you "${issue.title}"`,
      link: NotificationLinks.issue(issue.projectId, issue.id),
    });
  }
}
