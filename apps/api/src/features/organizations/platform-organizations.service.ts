import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normalizeRole, ORG_ROLES, OrgRole } from '../../common/constants/roles.constants';
import { PaginationService } from '../../common/pagination/pagination.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../users/password.service';
import { USER_SUMMARY_SELECT } from '../users/users.select';
import {
  CreatePlatformOrganizationDto,
  InitialCoordinatorDto,
  PlatformOrganizationQueryDto,
  UpdatePlatformOrganizationDto,
} from './dto/platform-organization.dto';
import { OrganizationsService } from './organizations.service';

/** Root-only administration of every organization on the platform. */
@Injectable()
export class PlatformOrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly passwords: PasswordService,
    private readonly pagination: PaginationService,
  ) {}

  private include() {
    return {
      _count: { select: { users: true, projects: true } },
    } satisfies Prisma.OrganizationInclude;
  }

  async findAll(query: PlatformOrganizationQueryDto) {
    const page = this.pagination.resolve(query.page, query.limit);
    const where: Prisma.OrganizationWhereInput = {
      ...(query.status ? { isActive: query.status === 'active' } : {}),
      ...(query.search ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { slug: { contains: query.search.toLowerCase(), mode: 'insensitive' } }] } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.organization.findMany({
        where,
        include: this.include(),
        orderBy: { createdAt: query.sortOrder ?? 'desc' },
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.organization.count({ where }),
    ]);
    return this.pagination.build(data, total, page);
  }

  async findOne(id: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        _count: { select: { users: true, projects: true } },
        users: {
          orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
          select: { ...USER_SUMMARY_SELECT, role: true, jobTitle: true, isActive: true, lastLoginAt: true, twoFactorEnabledAt: true },
        },
      },
    });
    if (!organization) throw new NotFoundException('Organization not found');
    const { users: people, ...rest } = organization;
    const coordinators = people.filter((person) => normalizeRole(person.role) === OrgRole.PROJECT_COORDINATOR);
    return { ...rest, coordinators, people };
  }

  /** Creates an organization together with its first project coordinator. */
  async create(dto: CreatePlatformOrganizationDto) {
    const email = dto.coordinator.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('A user with this email already exists');
    }
    const passwordHash = await this.passwords.hash(dto.coordinator.password);
    const organization = await this.prisma.$transaction(async (tx) => {
      const created = await this.organizations.provision(tx, dto.name);
      await tx.user.create({
        data: {
          organizationId: created.id,
          email,
          passwordHash,
          firstName: dto.coordinator.firstName,
          lastName: dto.coordinator.lastName,
          role: OrgRole.PROJECT_COORDINATOR,
        },
      });
      return created;
    });
    return this.findOne(organization.id);
  }

  /** Appoints another project coordinator by creating their account in the organization. */
  async addCoordinator(id: string, dto: InitialCoordinatorDto) {
    await this.assertExists(id);
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('A user with this email already exists');
    }
    await this.prisma.user.create({
      data: {
        organizationId: id,
        email,
        passwordHash: await this.passwords.hash(dto.password),
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: OrgRole.PROJECT_COORDINATOR,
      },
    });
    return this.findOne(id);
  }

  /** Sets a new password for someone in the organization and signs them out everywhere. */
  async resetPassword(id: string, userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, organizationId: id }, select: { id: true } });
    if (!user) throw new NotFoundException('Person not found in this organization');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await this.passwords.hash(password) } }),
      this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
  }

  /** Clears someone's authenticator app; they set it up again at their next sign-in. */
  async resetTwoFactor(id: string, userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, organizationId: id }, select: { id: true } });
    if (!user) throw new NotFoundException('Person not found in this organization');
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { twoFactorSecret: null, twoFactorEnabledAt: null, twoFactorRecoveryCodes: null, twoFactorLastStep: null } }),
      this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
  }

  /** Moves a person between member and project coordinator. Takes effect on their next request. */
  async changeRole(id: string, userId: string, role: string) {
    if (!(ORG_ROLES as readonly string[]).includes(role)) throw new BadRequestException('Unknown role');
    const user = await this.prisma.user.findFirst({ where: { id: userId, organizationId: id }, select: { id: true } });
    if (!user) throw new NotFoundException('Person not found in this organization');
    await this.prisma.user.update({ where: { id: userId }, data: { role } });
    return this.findOne(id);
  }

  async update(id: string, dto: UpdatePlatformOrganizationDto) {
    await this.assertExists(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.organization.update({ where: { id }, data: dto });
      if (dto.isActive === false) {
        // Suspension takes effect immediately: every session of the organization is revoked.
        await tx.refreshToken.updateMany({
          where: { revokedAt: null, user: { organizationId: id } },
          data: { revokedAt: new Date() },
        });
      }
    });
    return this.findOne(id);
  }

  /**
   * Permanently deletes an organization and all of its data. Projects go first because
   * project/issue/task rows restrict deletion of the users and lookups they reference.
   */
  async remove(id: string): Promise<void> {
    await this.assertExists(id);
    await this.prisma.$transaction([
      this.prisma.project.deleteMany({ where: { organizationId: id } }),
      this.prisma.organization.delete({ where: { id } }),
    ]);
  }

  private async assertExists(id: string): Promise<void> {
    if (!(await this.prisma.organization.count({ where: { id } }))) throw new NotFoundException('Organization not found');
  }
}
