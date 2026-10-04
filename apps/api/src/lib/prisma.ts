import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const datasourceUrl =
  process.env.NODE_ENV === 'test'
    ? process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL
    : process.env.DATABASE_URL;

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl,
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
