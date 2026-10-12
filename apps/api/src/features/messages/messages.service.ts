import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Conversation, Prisma } from '@prisma/client';
import { NotificationType } from '../../common/constants/domain.constants';
import { isViewer, OrgRole, PlatformRole } from '../../common/constants/roles.constants';
import { NotificationLinks } from '../../common/events/domain-events';
import { EventPublisher } from '../../common/events/event-publisher.service';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { fullName } from '../../common/utils/string.util';
import { PrismaService } from '../../prisma/prisma.service';
import { USER_SUMMARY_SELECT } from '../users/users.select';
import { detectImageType } from '../../common/utils/image.util';
import { MAX_IMAGE_BYTES, MAX_IMAGES_PER_COMMENT, PENDING_IMAGE_TTL_MS } from '../comments/comment-images';

const PAGE_SIZE = 50;
const MESSAGE_SELECT = {
  id: true,
  senderId: true,
  body: true,
  createdAt: true,
  attachments: { select: { id: true, mimeType: true, size: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.DirectMessageSelect;
const CONTACT_SELECT = { ...USER_SUMMARY_SELECT, jobTitle: true, role: true } satisfies Prisma.UserSelect;

/**
 * One-to-one chats inside an organization. Staff can write to anyone in the organization (and to
 * root admins working on its projects); clients can write to the team of the projects they are on.
 * There is no live connection: the app checks for new messages every few seconds.
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventPublisher,
  ) {}

  /** People the user may start a chat with. */
  contacts(user: AuthenticatedUser) {
    return this.prisma.user.findMany({
      where: { AND: [{ id: { not: user.id }, isActive: true }, this.contactsWhere(user)] },
      select: CONTACT_SELECT,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  async conversations(user: AuthenticatedUser) {
    const conversations = await this.prisma.conversation.findMany({
      where: { organizationId: user.organizationId, OR: [{ userAId: user.id }, { userBId: user.id }], lastMessageAt: { not: null } },
      include: {
        userA: { select: CONTACT_SELECT },
        userB: { select: CONTACT_SELECT },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { body: true, senderId: true, createdAt: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
    });
    const unread = await this.unreadByConversation(user, conversations);
    return conversations.map((conversation) => this.present(user, conversation, unread.get(conversation.id) ?? 0));
  }

  /** Opens (or creates) the chat with one person. */
  async start(user: AuthenticatedUser, otherId: string) {
    if (otherId === user.id) throw new BadRequestException('Choose someone else to chat with');
    const other = await this.prisma.user.findFirst({
      where: { AND: [{ id: otherId, isActive: true }, this.contactsWhere(user)] },
      select: { id: true },
    });
    if (!other) throw new ForbiddenException('You cannot start a chat with this person');
    const [userAId, userBId] = [user.id, otherId].sort();
    const where = { organizationId_userAId_userBId: { organizationId: user.organizationId, userAId, userBId } };
    const include = { userA: { select: CONTACT_SELECT }, userB: { select: CONTACT_SELECT }, messages: { take: 0 } } as const;
    try {
      const conversation = await this.prisma.conversation.upsert({ where, create: { organizationId: user.organizationId, userAId, userBId }, update: {}, include });
      return this.present(user, conversation, 0);
    } catch (error) {
      // Both people (or two tabs) opened the chat at the same moment: use the one that was created.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
      return this.present(user, await this.prisma.conversation.findUniqueOrThrow({ where, include }), 0);
    }
  }

  async messages(user: AuthenticatedUser, conversationId: string, before?: string) {
    await this.findOwn(user, conversationId);
    const cursor = before ? await this.prisma.directMessage.findFirst({ where: { id: before, conversationId }, select: { createdAt: true } }) : null;
    const page = await this.prisma.directMessage.findMany({
      where: { conversationId, ...(cursor ? { createdAt: { lt: cursor.createdAt } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      select: MESSAGE_SELECT,
    });
    return { data: page.reverse(), hasMore: page.length === PAGE_SIZE };
  }

  async send(user: AuthenticatedUser, conversationId: string, text: string | undefined, attachmentIds: string[] = []) {
    const conversation = await this.findOwn(user, conversationId);
    const body = text ?? '';
    const imageIds = [...new Set(attachmentIds)];
    if (!body && !imageIds.length) throw new BadRequestException('Write a message or attach an image');
    if (imageIds.length > MAX_IMAGES_PER_COMMENT) throw new BadRequestException(`Attach at most ${MAX_IMAGES_PER_COMMENT} images`);
    const otherId = conversation.userAId === user.id ? conversation.userBId : conversation.userAId;
    const recipient = await this.prisma.user.findFirst({ where: { id: otherId, isActive: true }, select: { id: true } });
    if (!recipient) throw new BadRequestException('This person can no longer receive messages');

    const now = new Date();
    const mine = conversation.userAId === user.id ? 'userAReadAt' : 'userBReadAt';
    const theirs = conversation.userAId === user.id ? 'userBReadAt' : 'userAReadAt';
    // Tell the other person only when this starts a new unread stretch, not for every line of a conversation.
    const alreadyUnread = await this.prisma.directMessage.count({
      where: { conversationId, senderId: user.id, ...(conversation[theirs] ? { createdAt: { gt: conversation[theirs] } } : {}) },
    });
    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.directMessage.create({ data: { conversationId, senderId: user.id, body } });
      if (imageIds.length) {
        // Only the sender's own, not yet sent uploads for this chat.
        const { count } = await tx.messageAttachment.updateMany({
          where: { id: { in: imageIds }, uploaderId: user.id, conversationId, messageId: null },
          data: { messageId: created.id },
        });
        if (count !== imageIds.length) throw new BadRequestException('Some images could not be attached. Add them again.');
      }
      await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now, [mine]: now } });
      return tx.directMessage.findUniqueOrThrow({ where: { id: created.id }, select: MESSAGE_SELECT });
    });
    if (!alreadyUnread) {
      this.events.notify({
        recipientIds: [otherId],
        actorId: user.id,
        type: NotificationType.DIRECT_MESSAGE,
        title: `New message from ${fullName(user)}`,
        body: body ? body.slice(0, 140) : imageIds.length === 1 ? 'Sent an image' : `Sent ${imageIds.length} images`,
        link: NotificationLinks.conversation(conversationId),
      });
    }
    return message;
  }

  /** Stores an image for a message about to be sent in this chat. */
  async uploadImage(user: AuthenticatedUser, conversationId: string, data: Buffer | undefined) {
    if (!Buffer.isBuffer(data) || !data.length) throw new BadRequestException('Choose an image to send');
    if (data.length > MAX_IMAGE_BYTES) throw new BadRequestException(`Images can be at most ${MAX_IMAGE_BYTES / 1024 / 1024} MB`);
    const mimeType = detectImageType(data);
    await this.findOwn(user, conversationId);
    await this.prisma.messageAttachment.deleteMany({ where: { messageId: null, createdAt: { lt: new Date(Date.now() - PENDING_IMAGE_TTL_MS) } } });
    const pending = await this.prisma.messageAttachment.count({ where: { uploaderId: user.id, messageId: null } });
    if (pending >= MAX_IMAGES_PER_COMMENT * 3) throw new BadRequestException('Send or remove the images you already added first');
    return this.prisma.messageAttachment.create({
      data: { conversationId, uploaderId: user.id, mimeType, size: data.length, data: new Uint8Array(data) },
      select: { id: true, mimeType: true, size: true },
    });
  }

  /** An image's bytes, for the two people in the chat (unsent uploads: only their uploader). */
  async image(user: AuthenticatedUser, id: string) {
    const image = await this.prisma.messageAttachment.findUnique({ where: { id } });
    if (!image || (!image.messageId && image.uploaderId !== user.id)) throw new NotFoundException('Image not found');
    await this.findOwn(user, image.conversationId).catch(() => {
      throw new NotFoundException('Image not found');
    });
    return image;
  }

  async removePendingImage(user: AuthenticatedUser, id: string): Promise<void> {
    await this.prisma.messageAttachment.deleteMany({ where: { id, uploaderId: user.id, messageId: null } });
  }

  async markRead(user: AuthenticatedUser, conversationId: string): Promise<void> {
    const conversation = await this.findOwn(user, conversationId);
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { [conversation.userAId === user.id ? 'userAReadAt' : 'userBReadAt']: new Date() },
    });
  }

  async unreadCount(user: AuthenticatedUser) {
    const conversations = await this.prisma.conversation.findMany({
      where: { organizationId: user.organizationId, OR: [{ userAId: user.id }, { userBId: user.id }], lastMessageAt: { not: null } },
    });
    const unread = await this.unreadByConversation(user, conversations);
    return { count: [...unread.values()].reduce((sum, n) => sum + n, 0) };
  }

  /** Who the user may chat with (see the class comment). */
  private contactsWhere(user: AuthenticatedUser): Prisma.UserWhereInput {
    const onTheirProjects: Prisma.UserWhereInput = {
      memberships: { some: { project: { organizationId: user.organizationId, members: { some: { userId: user.id } } } } },
    };
    if (isViewer(user.role)) return { role: { not: OrgRole.VIEWER }, OR: [{ organizationId: user.organizationId }, { role: PlatformRole.ROOT }], ...onTheirProjects };
    return {
      OR: [
        { organizationId: user.organizationId },
        { role: PlatformRole.ROOT, memberships: { some: { project: { organizationId: user.organizationId } } } },
      ],
    };
  }

  private async findOwn(user: AuthenticatedUser, id: string): Promise<Conversation> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, organizationId: user.organizationId, OR: [{ userAId: user.id }, { userBId: user.id }] },
    });
    if (!conversation) throw new NotFoundException('Chat not found');
    return conversation;
  }

  private async unreadByConversation(user: AuthenticatedUser, conversations: Conversation[]): Promise<Map<string, number>> {
    const counts = await Promise.all(
      conversations.map(async (conversation) => {
        const readAt = conversation.userAId === user.id ? conversation.userAReadAt : conversation.userBReadAt;
        if (readAt && conversation.lastMessageAt && conversation.lastMessageAt <= readAt) return [conversation.id, 0] as const;
        const count = await this.prisma.directMessage.count({
          where: { conversationId: conversation.id, senderId: { not: user.id }, ...(readAt ? { createdAt: { gt: readAt } } : {}) },
        });
        return [conversation.id, count] as const;
      }),
    );
    return new Map(counts);
  }

  private present<T extends Conversation & { userA: unknown; userB: unknown; messages: { body: string; senderId: string; createdAt: Date }[] }>(
    user: AuthenticatedUser,
    conversation: T,
    unread: number,
  ) {
    return {
      id: conversation.id,
      other: conversation.userAId === user.id ? conversation.userB : conversation.userA,
      lastMessage: conversation.messages[0] ?? null,
      lastMessageAt: conversation.lastMessageAt,
      unread,
    };
  }
}
