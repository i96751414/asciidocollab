import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * Test container context for database-backed tests.
 */
export interface TestContainer {
  /** The running PostgreSQL container. */
  container: StartedTestContainer;
  /** Prisma client connected to the test database. */
  client: PrismaClient;
}

function findRootDir(dir: string): string {
  const marker = path.join(dir, 'pnpm-workspace.yaml');
  if (fs.existsSync(marker)) return dir;
  const parent = path.dirname(dir);
  if (parent === dir) return dir;
  return findRootDir(parent);
}

/**
 * Starts a PostgreSQL test container and pushes the Prisma schema.
 *
 * @returns A TestContainer with the running container and connected Prisma client.
 */
export async function startTestContainer(): Promise<TestContainer> {
  const container = await new GenericContainer('postgres:16-alpine')
    .withEnvironment({ POSTGRES_USER: 'test', POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'test' })
    .withExposedPorts(5432)
    .start();

  const port = container.getMappedPort(5432);
  const host = container.getHost();
  const databaseUrl = `postgresql://test:test@${host}:${port}/test`;

  const rootDir = findRootDir(__dirname);
  const schemaPath = path.join(rootDir, 'packages', 'db', 'prisma', 'schema.prisma');

  execSync(`npx prisma db push --schema="${schemaPath}" --accept-data-loss`, {
    env: { ...process.env, ASCIIDOCOLLAB_DATABASE_URL: databaseUrl },
    cwd: path.join(rootDir, 'packages', 'db'),
    stdio: 'pipe',
  });

  const adapter = new PrismaPg(databaseUrl);
  const client = new PrismaClient({ adapter });

  return { container, client };
}

/**
 * Stops the test container and disconnects the Prisma client.
 *
 * @param testContext - The test container context to stop.
 */
export async function stopTestContainer(testContext: TestContainer): Promise<void> {
  await testContext.client.$disconnect();
  await testContext.container.stop();
}
