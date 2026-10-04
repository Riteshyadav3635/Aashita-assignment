import { Prisma, type PrismaClient } from '@prisma/client';

export async function recordActivity(
  tx: Prisma.TransactionClient | PrismaClient,
  data: {
    workspaceId: string;
    actorId: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Prisma.InputJsonValue | null;
  },
) {
  return tx.activityLog.create({
    data: {
      workspaceId: data.workspaceId,
      actorId: data.actorId,
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId ?? null,
      metadata: data.metadata === null ? Prisma.DbNull : data.metadata,
    },
  });
}
