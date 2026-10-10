import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PlatformRole } from '../../common/constants/roles.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { InitialCoordinatorDto } from '../organizations/dto/platform-organization.dto';
import { Inviter } from '../organizations/platform-organizations.service';
import { AccountLinksService } from '../users/account-links.service';
import { PasswordService } from '../users/password.service';

const ADMIN_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  jobTitle: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

/** Root admins: platform-level accounts that create organizations and appoint project coordinators. */
@Injectable()
export class PlatformAdminsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly links: AccountLinksService,
  ) {}

  findAll() {
    return this.prisma.user.findMany({
      where: { role: PlatformRole.ROOT },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
      select: ADMIN_SELECT,
    });
  }

  /** Without a password the new root admin is invited by email to choose one. */
  async create(dto: InitialCoordinatorDto, inviter: Inviter) {
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('A user with this email already exists');
    }
    const admin = await this.prisma.user.create({
      data: {
        organizationId: null,
        email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        jobTitle: 'Platform Administrator',
        role: PlatformRole.ROOT,
        passwordHash: dto.password ? await this.passwords.hash(dto.password) : await this.links.unusablePasswordHash(),
      },
      select: ADMIN_SELECT,
    });
    if (!dto.password) {
      try {
        await this.links.sendInvite(admin, inviter.origin, inviter.name, 'platform administration');
      } catch (error) {
        await this.prisma.user.delete({ where: { id: admin.id } });
        throw error;
      }
    }
    return admin;
  }

  async resendInvite(id: string, inviter: Inviter): Promise<void> {
    const admin = await this.find(id);
    if (!admin.isActive) throw new BadRequestException('Reactivate this root admin before inviting them');
    await this.links.sendInvite(admin, inviter.origin, inviter.name, 'platform administration');
  }

  /** Deactivating signs the admin out everywhere. The platform always keeps one active root admin. */
  async setActive(actorId: string, id: string, isActive: boolean) {
    const admin = await this.find(id);
    if (!isActive) {
      if (admin.id === actorId) throw new BadRequestException('You cannot deactivate yourself');
      const active = await this.prisma.user.count({ where: { role: PlatformRole.ROOT, isActive: true } });
      if (admin.isActive && active <= 1) throw new BadRequestException('At least one root admin must stay active');
    }
    const updated = await this.prisma.user.update({ where: { id }, data: { isActive }, select: ADMIN_SELECT });
    if (!isActive) {
      await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    return updated;
  }

  private async find(id: string) {
    const admin = await this.prisma.user.findFirst({ where: { id, role: PlatformRole.ROOT }, select: ADMIN_SELECT });
    if (!admin) throw new NotFoundException('Root admin not found');
    return admin;
  }
}
