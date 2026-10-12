import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normalizeRole, ORG_ROLES, OrgRole } from '../../common/constants/roles.constants';
import { PaginationService } from '../../common/pagination/pagination.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountLinksService } from '../users/account-links.service';
import { PasswordService } from '../users/password.service';
import { USER_SUMMARY_SELECT } from '../users/users.select';
import {
  CreatePlatformOrganizationDto,
  InitialCoordinatorDto,
  PlatformOrganizationQueryDto,
  UpdatePlatformOrganizationDto,
} from './dto/platform-organization.dto';
import { OrganizationsService } from './organizations.service';

/** Who is creating an account, for the invitation email. */
export interface Inviter {
  name: string;
  origin: string;
}

/** Root-only administration of every organization on the platform. */
@Injectable()
export class PlatformOrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly passwords: PasswordService,
    private readonly pagination: PaginationService,
    private readonly links: AccountLinksService,
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
          select: { ...USER_SUMMARY_SELECT, role: true, jobTitle: true, isActive: true, lastLoginAt: true },
        },
      },
    });
    if (!organization) throw new NotFoundException('Organization not found');
    const { users: people, ...rest } = organization;
    const coordinators = people.filter((person) => normalizeRole(person.role) === OrgRole.PROJECT_COORDINATOR);
    return { ...rest, coordinators, people };
  }

  /** Creates an organization together with its first project coordinator (invited by email without a password). */
  async create(dto: CreatePlatformOrganizationDto, inviter: Inviter) {
    const email = dto.coordinator.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('A user with this email already exists');
    }
    const passwordHash = await this.passwordHashFor(dto.coordinator.password);
    const { organization, coordinator } = await this.prisma.$transaction(async (tx) => {
      const created = await this.organizations.provision(tx, dto.name);
      const user = await tx.user.create({
        data: {
          organizationId: created.id,
          email,
          passwordHash,
          firstName: dto.coordinator.firstName,
          lastName: dto.coordinator.lastName,
          role: OrgRole.PROJECT_COORDINATOR,
        },
      });
      return { organization: created, coordinator: user };
    });
    if (!dto.coordinator.password) {
      try {
        await this.links.sendInvite(coordinator, inviter.origin, inviter.name, organization.name);
      } catch (error) {
        await this.remove(organization.id);
        throw error;
      }
    }
    return this.findOne(organization.id);
  }

  /** Appoints another project coordinator by creating their account in the organization. */
  async addCoordinator(id: string, dto: InitialCoordinatorDto, inviter: Inviter) {
    await this.assertExists(id);
    const email = dto.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('A user with this email already exists');
    }
    const user = await this.prisma.user.create({
      data: {
        organizationId: id,
        email,
        passwordHash: await this.passwordHashFor(dto.password),
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: OrgRole.PROJECT_COORDINATOR,
      },
      include: { organization: { select: { name: true } } },
    });
    if (!dto.password) {
      try {
        await this.links.sendInvite(user, inviter.origin, inviter.name, user.organization?.name);
      } catch (error) {
        await this.prisma.user.delete({ where: { id: user.id } });
        throw error;
      }
    }
    return this.findOne(id);
  }

  /** Re-sends the invitation (or a set-password link) to anyone in the organization. */
  async resendCoordinatorInvite(id: string, userId: string, inviter: Inviter): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId: id, isActive: true },
      include: { organization: { select: { name: true } } },
    });
    if (!user) throw new NotFoundException('Person not found in this organization');
    await this.links.sendInvite(user, inviter.origin, inviter.name, user.organization?.name);
  }

  private passwordHashFor(password: string | undefined): Promise<string> {
    return password ? this.passwords.hash(password) : this.links.unusablePasswordHash();
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
