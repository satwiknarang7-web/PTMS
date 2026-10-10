/**
 * Removes the demo people and demo projects that earlier versions seeded into the company
 * organization, keeping the organization itself and everything real people created.
 *
 *   npm run db:remove-demo              # delete
 *   npm run db:remove-demo -- --dry-run # only list what would be deleted
 *
 * Demo projects are only deleted when a demo account owns them. Anything else a demo account is
 * attached to (tasks, issues, meetings, automations, projects) is handed to a real project
 * coordinator, or to the first root admin when the organization has none.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { OrgRole, PlatformRole, ProjectRole } from '../src/common/constants/roles.constants';
import { LEGACY_DEMO } from './seed-data';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

async function main() {
  const organization = await prisma.organization.findFirst({ where: { name: LEGACY_DEMO.organizationName } });
  if (!organization) {
    console.log(`No organization named "${LEGACY_DEMO.organizationName}"; nothing to remove.`);
    return;
  }

  const demoUsers = await prisma.user.findMany({
    where: { organizationId: organization.id, email: { in: LEGACY_DEMO.emails } },
    select: { id: true, email: true },
  });
  const demoIds = demoUsers.map((u) => u.id);
  const demoProjects = await prisma.project.findMany({
    where: { organizationId: organization.id, key: { in: LEGACY_DEMO.projectKeys }, ownerId: { in: demoIds } },
    select: { id: true, key: true, name: true },
  });

  console.log(`Organization "${organization.name}"`);
  console.log(`  demo people:   ${demoUsers.map((u) => u.email).join(', ') || 'none'}`);
  console.log(`  demo projects: ${demoProjects.map((p) => `${p.key} - ${p.name}`).join(', ') || 'none'}`);
  if (dryRun || (!demoUsers.length && !demoProjects.length)) {
    if (dryRun) console.log('Dry run: nothing was deleted.');
    return;
  }

  const heir =
    (await prisma.user.findFirst({
      where: { organizationId: organization.id, isActive: true, role: OrgRole.PROJECT_COORDINATOR, id: { notIn: demoIds } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true },
    })) ??
    (await prisma.user.findFirst({ where: { role: PlatformRole.ROOT, isActive: true }, orderBy: { createdAt: 'asc' }, select: { id: true, email: true } }));
  if (!heir) throw new Error('No active coordinator or root admin to hand remaining work over to');

  const handedOver = await prisma.project.findMany({
    where: { ownerId: { in: demoIds }, id: { notIn: demoProjects.map((p) => p.id) } },
    select: { id: true },
  });

  await prisma.$transaction([
    // Projects cascade to their groups, tasks, issues, milestones, time entries and comments.
    prisma.project.deleteMany({ where: { id: { in: demoProjects.map((p) => p.id) } } }),
    prisma.project.updateMany({ where: { id: { in: handedOver.map((p) => p.id) } }, data: { ownerId: heir.id } }),
    prisma.projectMember.createMany({
      data: handedOver.map((p) => ({ projectId: p.id, userId: heir.id, role: ProjectRole.MEMBER })),
      skipDuplicates: true,
    }),
    prisma.task.updateMany({ where: { createdById: { in: demoIds } }, data: { createdById: heir.id } }),
    prisma.issue.updateMany({ where: { reporterId: { in: demoIds } }, data: { reporterId: heir.id } }),
    prisma.meeting.updateMany({ where: { createdById: { in: demoIds } }, data: { createdById: heir.id } }),
    prisma.automation.updateMany({ where: { createdById: { in: demoIds } }, data: { createdById: heir.id } }),
    prisma.user.deleteMany({ where: { id: { in: demoIds } } }),
  ]);

  console.log(`✔ Removed ${demoUsers.length} demo people and ${demoProjects.length} demo projects`);
  if (handedOver.length) console.log(`✔ Handed ${handedOver.length} other projects over to ${heir.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
