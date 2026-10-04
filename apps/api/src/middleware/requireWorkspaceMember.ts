import { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';

const uuidSchema = z.string().uuid();

export async function requireWorkspaceMember(req: Request, _res: Response, next: NextFunction) {
  try {
    const workspaceId = uuidSchema.parse(req.params.workspaceId);
    const userId = req.user?.id;

    if (!userId) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
    }

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) {
      throw new AppError(404, 'NOT_FOUND', 'Workspace not found');
    }

    const membership = await prisma.membership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
    });

    if (!membership) {
      throw new AppError(404, 'NOT_FOUND', 'Workspace member not found');
    }

    req.membership = {
      workspaceId,
      userId,
      role: membership.role,
    };
    next();
  } catch (error) {
    next(error);
  }
}
