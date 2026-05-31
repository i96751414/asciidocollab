/**
 * Backfill script: set existing project creators to OWNER role in ProjectMember.
 *
 * Run after `prisma db push` adds the OWNER enum value:
 *   npx ts-node packages/db/scripts/backfill-owner-role.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const projects = await prisma.project.findMany({ select: { id: true, ownerId: true } });

  let updated = 0;
  for (const project of projects) {
    const result = await prisma.projectMember.updateMany({
      where: { projectId: project.id, userId: project.ownerId },
      data: { role: 'OWNER' },
    });
    updated += result.count;
  }

  console.log(`Backfilled ${updated} project-creator rows to OWNER role.`);
}

main()
  .catch((error) => { console.error(error); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
