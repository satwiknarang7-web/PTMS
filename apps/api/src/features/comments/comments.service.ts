import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ActivityAction, EntityType, NotificationType } from '../../common/constants/domain.constants';
import { isCoordinator } from '../../common/constants/roles.constants';
import { NotificationLinks } from '../../common/events/domain-events';
import { EventPublisher } from '../../common/events/event-publisher.service';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { fullName } from '../../common/utils/string.util';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectAccessService } from '../projects/project-access.service';
import { USER_SUMMARY_SELECT } from '../users/users.select';
import { detectImageType, MAX_IMAGE_BYTES, MAX_IMAGES_PER_COMMENT, PENDING_IMAGE_TTL_MS } from './comment-images';
import { CommentQueryDto, CreateCommentDto } from './dto/comment.dto';

const COMMENT_INCLUDE = {
  author: { select: USER_SUMMARY_SELECT },
  attachments: { select: { id: true, mimeType: true, size: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.CommentInclude;

interface CommentTarget {
  projectId: string;
  title: string;
  link: string;
  /** Users interested in new comments (creator/reporter + assignees); earlier commenters are added on create. */
  watcherIds: string[];
}

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly events: EventPublisher,
  ) {}

  async findAll(user: AuthenticatedUser, query: CommentQueryDto) {
    const target = await this.resolveTarget(user, query);
    await this.access.assertCanView(user, target.projectId);
    return this.prisma.comment.findMany({
      where: query.taskId ? { taskId: query.taskId } : { issueId: query.issueId },
      include: COMMENT_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(user: AuthenticatedUser, dto: CreateCommentDto) {
    const target = await this.resolveTarget(user, dto);
    await this.assertWritable(user, target.projectId);
    const body = dto.body ?? '';
    const attachmentIds = [...new Set(dto.attachmentIds ?? [])];
    if (!body && !attachmentIds.length) throw new BadRequestException('Write a comment or attach an image');
    if (attachmentIds.length > MAX_IMAGES_PER_COMMENT) throw new BadRequestException(`Attach at most ${MAX_IMAGES_PER_COMMENT} images`);

    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: { authorId: user.id, body, taskId: dto.taskId ?? null, issueId: dto.issueId ?? null },
      });
      if (attachmentIds.length) {
        // Only the author's own, not yet used uploads for this same project can be attached.
        const { count } = await tx.commentAttachment.updateMany({
          where: { id: { in: attachmentIds }, uploaderId: user.id, projectId: target.projectId, commentId: null },
          data: { commentId: created.id },
        });
        if (count !== attachmentIds.length) throw new BadRequestException('Some images could not be attached. Add them again.');
      }
      return tx.comment.findUniqueOrThrow({ where: { id: created.id }, include: COMMENT_INCLUDE });
    });

    this.events.activity({
      organizationId: user.organizationId,
      projectId: target.projectId,
      actorId: user.id,
      entityType: dto.taskId ? EntityType.TASK : EntityType.ISSUE,
      entityId: (dto.taskId ?? dto.issueId)!,
      action: ActivityAction.COMMENTED,
      summary: `commented on ${target.title}`,
    });
    // Earlier commenters follow the conversation too.
    const participants = await this.prisma.comment.findMany({
      where: dto.taskId ? { taskId: dto.taskId } : { issueId: dto.issueId },
      distinct: ['authorId'],
      select: { authorId: true },
    });
    this.events.notify({
      recipientIds: [...target.watcherIds, ...participants.map((p) => p.authorId)],
      actorId: user.id,
      type: NotificationType.COMMENT_ADDED,
      title: `New comment on ${target.title}`,
      body: `${fullName(user)}: ${body ? body.slice(0, 140) : `shared ${attachmentIds.length === 1 ? 'an image' : `${attachmentIds.length} images`}`}`,
      link: target.link,
    });
    return comment;
  }

  async update(user: AuthenticatedUser, id: string, body: string) {
    const comment = await this.findOwned(user, id);
    if (comment.authorId !== user.id) throw new ForbiddenException('You can only edit your own comments');
    if (!body && !(await this.prisma.commentAttachment.count({ where: { commentId: id } }))) {
      throw new BadRequestException('A comment needs text or an image');
    }
    return this.prisma.comment.update({ where: { id }, data: { body }, include: COMMENT_INCLUDE });
  }

  /** Stores an image for a comment that is about to be posted on this task or issue. */
  async uploadImage(user: AuthenticatedUser, query: CommentQueryDto, data: Buffer | undefined) {
    if (!Buffer.isBuffer(data) || !data.length) throw new BadRequestException('Choose an image to attach');
    if (data.length > MAX_IMAGE_BYTES) throw new BadRequestException(`Images can be at most ${MAX_IMAGE_BYTES / 1024 / 1024} MB`);
    const mimeType = detectImageType(data);
    const target = await this.resolveTarget(user, query);
    await this.assertWritable(user, target.projectId);

    // Uploads that were never posted with a comment are cleared out as new ones arrive.
    await this.prisma.commentAttachment.deleteMany({ where: { commentId: null, createdAt: { lt: new Date(Date.now() - PENDING_IMAGE_TTL_MS) } } });
    const pending = await this.prisma.commentAttachment.count({ where: { uploaderId: user.id, commentId: null } });
    if (pending >= MAX_IMAGES_PER_COMMENT * 3) throw new BadRequestException('Post or remove the images you already added first');

    return this.prisma.commentAttachment.create({
      data: { projectId: target.projectId, uploaderId: user.id, mimeType, size: data.length, data: new Uint8Array(data) },
      select: { id: true, mimeType: true, size: true },
    });
  }

  /** An image's bytes, for anyone who can see the task or issue (unposted uploads: only their uploader). */
  async image(user: AuthenticatedUser, id: string) {
    const image = await this.prisma.commentAttachment.findUnique({ where: { id } });
    if (!image || (!image.commentId && image.uploaderId !== user.id)) throw new NotFoundException('Image not found');
    const { canView } = await this.access.resolve(user, image.projectId).catch(() => ({ canView: false }));
    if (!canView) throw new NotFoundException('Image not found');
    return image;
  }

  /** Removes an image that was uploaded but not posted yet. */
  async removePendingImage(user: AuthenticatedUser, id: string): Promise<void> {
    await this.prisma.commentAttachment.deleteMany({ where: { id, uploaderId: user.id, commentId: null } });
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    const comment = await this.findOwned(user, id);
    if (comment.authorId !== user.id && !isCoordinator(user.role)) {
      throw new ForbiddenException('You can only delete your own comments');
    }
    await this.prisma.comment.delete({ where: { id } });
  }

  /**
   * A comment the user can see, scoped by the project it belongs to (not by its author, since the
   * root account writes comments without belonging to the organization). Archived projects are read-only.
   */
  private async findOwned(user: AuthenticatedUser, id: string) {
    const projectScope = { organizationId: user.organizationId };
    const comment = await this.prisma.comment.findFirst({
      where: { id, OR: [{ task: { project: projectScope } }, { issue: { project: projectScope } }] },
      include: { task: { select: { projectId: true } }, issue: { select: { projectId: true } } },
    });
    const projectId = comment?.task?.projectId ?? comment?.issue?.projectId;
    if (!comment || !projectId) throw new NotFoundException('Comment not found');
    await this.assertWritable(user, projectId, 'Comment not found');
    return comment;
  }

  private async assertWritable(user: AuthenticatedUser, projectId: string, notFound = 'Project not found'): Promise<void> {
    const { canView, project } = await this.access.resolve(user, projectId);
    if (!canView) throw new NotFoundException(notFound);
    if (project.isArchived) throw new BadRequestException('Archived projects are read-only');
  }

  private async resolveTarget(user: AuthenticatedUser, query: CommentQueryDto): Promise<CommentTarget> {
    if (!!query.taskId === !!query.issueId) {
      throw new BadRequestException('Provide exactly one of taskId or issueId');
    }
    const projectScope = { organizationId: user.organizationId };

    if (query.taskId) {
      const task = await this.prisma.task.findFirst({
        where: { id: query.taskId, project: projectScope },
        include: { project: { select: { key: true } }, assignees: { select: { userId: true } } },
      });
      if (!task) throw new NotFoundException('Task not found');
      return {
        projectId: task.projectId,
        title: `${task.project.key}-${task.number}`,
        link: NotificationLinks.task(task.projectId, task.id),
        watcherIds: [task.createdById, ...task.assignees.map((a) => a.userId)],
      };
    }

    const issue = await this.prisma.issue.findFirst({
      where: { id: query.issueId, project: projectScope },
      include: { project: { select: { key: true } } },
    });
    if (!issue) throw new NotFoundException('Issue not found');
    return {
      projectId: issue.projectId,
      title: `${issue.project.key}-BUG-${issue.number}`,
      link: NotificationLinks.issue(issue.projectId, issue.id),
      watcherIds: [issue.reporterId, ...(issue.assigneeId ? [issue.assigneeId] : [])],
    };
  }
}
