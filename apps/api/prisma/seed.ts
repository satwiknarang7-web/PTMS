/**
 * Seeds the first root admin and the company organization, and upgrades roles stored by earlier
 * versions. Account details live in seed-data.ts. Each step is idempotent, so the script is safe to re-run.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PlatformRole } from '../src/common/constants/roles.constants';
import { slugify } from '../src/common/utils/string.util';
import { DEFAULT_LOOKUPS } from '../src/features/lookups/lookup.defaults';
import { ORGANIZATION_DEFAULTS } from '../src/features/organizations/organization.defaults';
import { nextGroupColor } from '../src/features/task-lists/task-list.colors';
import { upgradeLegacyRoles } from '../src/features/users/role-upgrade.service';
import { COMPANY_ORGANIZATION, ROOT_ACCOUNT } from './seed-data';

const prisma = new PrismaClient();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

const saltRounds = () => Number(requireEnv('BCRYPT_SALT_ROUNDS'));

/** The first root admin: creates organizations, appoints their project coordinators and other root admins. */
async function seedRoot(): Promise<void> {
  const email = ROOT_ACCOUNT.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing?.role === PlatformRole.ROOT) {
    console.log(`✔ Root admin ${email} already exists`);
    return;
  }
  if (existing) {
    throw new Error(`Root email ${email} is already used by an organization user; set ROOT_EMAIL to another address`);
  }
  await prisma.user.create({
    data: {
      organizationId: null,
      email,
      passwordHash: await bcrypt.hash(ROOT_ACCOUNT.password, saltRounds()),
      firstName: ROOT_ACCOUNT.firstName,
      lastName: ROOT_ACCOUNT.lastName,
      jobTitle: ROOT_ACCOUNT.jobTitle,
      role: PlatformRole.ROOT,
    },
  });
  console.log(`✔ Created root admin ${email} (change its password after the first sign-in)`);
}

/** The company organization with its default workflow, on the first run only. No people are created. */
async function seedCompanyOrganization(): Promise<void> {
  const { name } = COMPANY_ORGANIZATION;
  if (await prisma.organization.findFirst({ where: { name } })) {
    console.log(`✔ Organization "${name}" already exists`);
    return;
  }
  await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.create({
      data: { name, slug: slugify(name) || 'workspace', ...ORGANIZATION_DEFAULTS },
    });
    const positions = new Map<string, number>();
    await tx.lookup.createMany({
      data: DEFAULT_LOOKUPS.map((seed) => {
        const position = positions.get(seed.type) ?? 0;
        positions.set(seed.type, position + 1);
        return { organizationId: organization.id, ...seed, category: seed.category ?? null, isDefault: !!seed.isDefault, position };
      }),
    });
  });
  console.log(`✔ Created organization "${name}" (appoint its project coordinators from the platform console)`);
}

/** Gives every group created before group colors existed a color from the palette. */
async function backfillGroupColors(): Promise<void> {
  const uncolored = await prisma.taskList.findMany({ where: { color: null }, select: { id: true, position: true } });
  for (const group of uncolored) {
    await prisma.taskList.update({ where: { id: group.id }, data: { color: nextGroupColor(group.position) } });
  }
  if (uncolored.length) console.log(`✔ Colored ${uncolored.length} existing groups`);
}

async function main() {
  await seedRoot();
  await seedCompanyOrganization();
  const upgraded = await upgradeLegacyRoles(prisma);
  if (upgraded) console.log(`✔ Upgraded ${upgraded} legacy role assignments`);
  await backfillGroupColors();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
