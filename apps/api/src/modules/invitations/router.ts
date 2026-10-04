import { type Request, type Response, Router } from 'express';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { eventPublisher } from '../../lib/events.js';
import { prisma } from '../../lib/prisma.js';
import { authenticate } from '../auth/middleware.js';
import { recordActivity } from '../activity/activity.service.js';
import { invalidateWorkspaceDashboard } from '../../lib/cache.js';
import { hashToken } from '../../lib/auth.js';

const acceptInviteSchema = z.object({
  token: z.string().min(1),
});

export const invitationsRouter = Router();

invitationsRouter.post('/accept', authenticate, async (req: Request, res: Response, next) => {
  try {
    const payload = acceptInviteSchema.parse(req.body);
    const tokenHash = hashToken(payload.token);
    const invitation = await prisma.invitation.findFirst({
      where: { tokenHash, acceptedAt: null, revokedAt: null },
    });

    if (!invitation) throw new AppError(404, 'NOT_FOUND', 'Invitation not found');
    if (invitation.expiresAt < new Date()) throw new AppError(410, 'TOKEN_EXPIRED', 'Invitation expired');
    if (req.user!.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw new AppError(403, 'FORBIDDEN', 'This invitation is for a different user');
    }

    const membership = await prisma.$transaction(async (tx) => {
      const existing = await tx.membership.findUnique({
        where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: req.user!.id } },
      });
      if (existing) {
        throw new AppError(409, 'ALREADY_MEMBER', 'You are already a member of this workspace');
      }

      const created = await tx.membership.create({
        data: {
          workspaceId: invitation.workspaceId,
          userId: req.user!.id,
          role: invitation.role,
        },
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });
      await recordActivity(tx, {
        workspaceId: invitation.workspaceId,
        actorId: req.user!.id,
        action: 'member.joined',
        entityType: 'membership',
        entityId: created.id,
      });
      return created;
    });

    await invalidateWorkspaceDashboard(invitation.workspaceId);
    eventPublisher.publish({
      type: 'member.joined',
      workspaceId: invitation.workspaceId,
      userId: req.user!.id,
      actorId: req.user!.id,
    });

    res.status(200).json({ membership });
  } catch (error) {
    next(error);
  }
});
