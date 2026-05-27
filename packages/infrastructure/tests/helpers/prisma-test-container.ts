import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface TestContainer {
  container: StartedTestContainer;
  client: PrismaClient;
}

function findRootDir(dir: string): string {
  const marker = path.join(dir, 'pnpm-workspace.yaml');
  if (fs.existsSync(marker)) return dir;
  const parent = path.dirname(dir);
  if (parent === dir) return dir;
  return findRootDir(parent);
}

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
    env: { ...process.env, DATABASE_URL: databaseUrl },
    cwd: path.join(rootDir, 'packages', 'db'),
    stdio: 'pipe',
  });

  const client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

  return { container, client };
}

export async function stopTestContainer(testContext: TestContainer): Promise<void> {
  await testContext.client.$disconnect();
  await testContext.container.stop();
}
