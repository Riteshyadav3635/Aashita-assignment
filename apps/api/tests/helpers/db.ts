import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const apiRoot = fileURLToPath(new URL('../..', import.meta.url));
const prisma = new PrismaClient({
  datasourceUrl: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL,
});

export async function resetDb() {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL or DATABASE_URL must be set for database-backed tests');
  }

  execSync('npx prisma migrate deploy', {
    cwd: apiRoot,
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      TEST_DATABASE_URL: testDatabaseUrl,
    },
    stdio: 'inherit',
  });

  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE "ActivityLog", "TaskLabel", "Label", "Task", "List", "Board", "Invitation", "RefreshToken", "Membership", "Workspace", "User"
    RESTART IDENTITY CASCADE;
  `);
}

export async function disconnectDb() {
  await prisma.$disconnect();
}
