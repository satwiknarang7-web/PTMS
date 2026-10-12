import { Injectable, NotFoundException } from '@nestjs/common';
import { Principal } from '../../common/interfaces/authenticated-user.interface';
import { PrismaService } from '../../prisma/prisma.service';
import { USER_SUMMARY_SELECT } from '../users/users.select';
import { CreateFeedbackDto } from './feedback.dto';

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: Principal, dto: CreateFeedbackDto): Promise<void> {
    await this.prisma.feedback.create({
      data: { userId: user.id, organizationId: user.organizationId ?? null, body: dto.body, page: dto.page ?? null },
    });
  }

  /** Every piece of feedback, open ones first (root only). */
  async findAll() {
    const items = await this.prisma.feedback.findMany({
      orderBy: [{ resolvedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'desc' }],
      include: { user: { select: { ...USER_SUMMARY_SELECT, email: true, role: true, jobTitle: true } } },
      take: 500,
    });
    const orgIds = [...new Set(items.map((item) => item.organizationId).filter((id): id is string => !!id))];
    const organizations = await this.prisma.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } });
    const names = new Map(organizations.map((org) => [org.id, org.name]));
    return items.map((item) => ({ ...item, organizationName: item.organizationId ? (names.get(item.organizationId) ?? null) : null }));
  }

  async setResolved(id: string, resolved: boolean) {
    const item = await this.prisma.feedback.findUnique({ where: { id }, select: { id: true } });
    if (!item) throw new NotFoundException('Feedback not found');
    return this.prisma.feedback.update({ where: { id }, data: { resolvedAt: resolved ? new Date() : null } });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.feedback.deleteMany({ where: { id } });
  }
}
