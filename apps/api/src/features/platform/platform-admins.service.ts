import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PlatformRole } from '../../common/constants/roles.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { InitialCoordinatorDto } from '../organizations/dto/platform-organization.dto';
import { PasswordService } from '../users/password.service';

const ADMIN_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  jobTitle: true,
  isActive: true,
  lastLoginAt: true,
  twoFactorEnabledAt: true,
  createdAt: true,
} as const;

/** Root admins: platform-level accounts that create organizations and appoint project coordinators. */
@Injectable()
export class PlatformAdminsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  findAll() {
    return this.prisma.user.findMany({
      where: { role: PlatformRole.ROOT },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
      select: ADMIN_SELECT,
    });
  }

  async create(dto: InitialCoordinatorDto) {
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('A user with this email already exists');
    }
    return this.prisma.user.create({
      data: {
        organizationId: null,
        email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        jobTitle: 'Platform Administrator',
        role: PlatformRole.ROOT,
        passwordHash: await this.passwords.hash(dto.password),
      },
      select: ADMIN_SELECT,
    });
  }

  /** Clears another root admin's authenticator app; they set it up again at their next sign-in. */
  async resetTwoFactor(actorId: string, id: string): Promise<void> {
    if (id === actorId) throw new BadRequestException('Ask another root admin to reset your authenticator');
    await this.find(id);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { twoFactorSecret: null, twoFactorEnabledAt: null, twoFactorRecoveryCodes: null, twoFactorLastStep: null } }),
      this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
  }

  /** Sets a new password for another root admin and signs them out everywhere. */
  async resetPassword(actorId: string, id: string, password: string): Promise<void> {
    if (id === actorId) throw new BadRequestException('Change your own password from your profile');
    await this.find(id);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { passwordHash: await this.passwords.hash(password) } }),
      this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
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
