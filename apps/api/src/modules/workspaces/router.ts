import { type Request, type Response, Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../lib/errors.js';
import { eventPublisher } from '../../lib/events.js';
import { prisma } from '../../lib/prisma.js';
import { authenticate } from '../auth/middleware.js';
import { recordActivity } from '../activity/activity.service.js';
import { getOrSet, invalidateWorkspaceDashboard, workspaceDashboardKey } from '../../lib/cache.js';
import { enqueueDailyDigest, enqueueInviteEmail } from '../../lib/queue.js';
import { positionBetween } from '../../lib/ordering.js';
import { requirePermission } from '../../middleware/requirePermission.js';
import { requireWorkspaceMember } from '../../middleware/requireWorkspaceMember.js';
import { canChangeRole, canInviteRole, canRemoveMember } from '../rbac/permissions.js';
import { env } from '../../config/env.js';
import { generateInvitationToken, hashToken } from '../../lib/auth.js';

const getRequiredParam = (value: string | string[] | undefined, name: string) => {
  const result = Array.isArray(value) ? value[0] : value;
  if (!result) {
    throw new AppError(400, 'INVALID_INPUT', `${name} is required`);
  }
  return result;
};

const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
});

const boardCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).optional(),
});

const boardUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
});

const listCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

const listUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
});

const listMoveSchema = z.object({
  afterListId: z.string().uuid().nullable().optional(),
});

const labelCreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#64748b'),
});

const labelUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

const taskCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10000).optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional(),
  assigneeId: z.string().uuid().optional(),
  dueDate: z.coerce.date().optional(),
  labelIds: z.array(z.string().uuid()).max(20).refine((ids) => new Set(ids).size === ids.length).optional(),
});

const taskUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(10000).nullable().optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  version: z.number().int().min(1).optional(),
  labelIds: z.array(z.string().uuid()).max(20).refine((ids) => new Set(ids).size === ids.length).optional(),
});

const taskMoveSchema = z.object({
  listId: z.string().uuid().optional(),
  afterTaskId: z.string().uuid().nullable().optional(),
  version: z.number().int().min(1).optional(),
});

const inviteSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']),
});

const memberRoleSchema = z.object({
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']),
});

const activityListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().uuid().optional(),
  action: z.string().trim().min(1).max(100).optional(),
  actorId: z.string().uuid().optional(),
});

const taskSearchSchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  boardId: z.string().uuid().optional(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional(),
  assigneeId: z.union([z.string().uuid(), z.literal('unassigned')]).optional(),
  labelId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

const acceptInviteSchema = z.object({
  token: z.string().min(1),
});

const getBoardForWorkspace = async (workspaceId: string, boardId: string) => {
  const board = await prisma.board.findFirst({ where: { id: boardId, workspaceId } });
  if (!board) {
    throw new AppError(404, 'NOT_FOUND', 'Board not found');
  }
  return board;
};

const getListForBoard = async (workspaceId: string, boardId: string, listId: string) => {
  const list = await prisma.list.findFirst({ where: { id: listId, boardId, workspaceId } });
  if (!list) {
    throw new AppError(404, 'NOT_FOUND', 'List not found');
  }
  return list;
};

const getTaskForBoard = async (workspaceId: string, boardId: string, taskId: string) => {
  const task = await prisma.task.findFirst({ where: { id: taskId, workspaceId, boardId } });
  if (!task) {
    throw new AppError(404, 'NOT_FOUND', 'Task not found');
  }
  return task;
};

async function searchWorkspaceTasks(workspaceId: string, query: z.infer<typeof taskSearchSchema>) {
  const conditions: Prisma.Sql[] = [Prisma.sql`"workspaceId" = ${workspaceId}::uuid`];
  if (query.boardId) conditions.push(Prisma.sql`"boardId" = ${query.boardId}::uuid`);
  if (query.status) conditions.push(Prisma.sql`"status" = ${query.status}::"TaskStatus"`);
  if (query.assigneeId === 'unassigned') conditions.push(Prisma.sql`"assigneeId" IS NULL`);
  else if (query.assigneeId) conditions.push(Prisma.sql`"assigneeId" = ${query.assigneeId}::uuid`);
  if (query.labelId) conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "TaskLabel" tl WHERE tl."taskId" = "Task"."id" AND tl."labelId" = ${query.labelId}::uuid)`);
  if (query.q) conditions.push(Prisma.sql`to_tsvector('english', coalesce("title", '') || ' ' || coalesce("description", '')) @@ websearch_to_tsquery('english', ${query.q})`);
  const where = Prisma.join(conditions, ' AND ');
  const offset = (query.page - 1) * query.pageSize;
  const rank = query.q
    ? Prisma.sql`ts_rank(to_tsvector('english', coalesce("title", '') || ' ' || coalesce("description", '')), websearch_to_tsquery('english', ${query.q})) DESC,`
    : Prisma.empty;
  const [matches, totalRows] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "Task" WHERE ${where} ORDER BY ${rank} "updatedAt" DESC, "id" DESC LIMIT ${query.pageSize} OFFSET ${offset}`),
    prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`SELECT count(*) AS total FROM "Task" WHERE ${where}`),
  ]);
  const ids = matches.map((item) => item.id);
  const tasks = ids.length ? await prisma.task.findMany({
    where: { workspaceId, id: { in: ids } },
    include: {
      assignee: { select: { id: true, name: true, email: true } },
      labels: { include: { label: true } },
      list: { select: { id: true, name: true } },
    },
  }) : [];
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const total = Number(totalRows[0]?.total ?? 0n);
  return { items: ids.map((id) => byId.get(id)).filter((task) => task !== undefined), total };
}

export const workspacesRouter = Router();

workspacesRouter.use(authenticate);

workspacesRouter.post('/', async (req: Request, res: Response, next) => {
  try {
    const payload = createWorkspaceSchema.parse(req.body);
    const workspace = await prisma.$transaction(async (tx) => {
      const created = await tx.workspace.create({ data: { name: payload.name } });
      await tx.membership.create({
        data: {
          workspaceId: created.id,
          userId: req.user!.id,
          role: 'OWNER',
        },
      });
      await recordActivity(tx, {
        workspaceId: created.id,
        actorId: req.user!.id,
        action: 'workspace.created',
        entityType: 'workspace',
        entityId: created.id,
      });
      return created;
    });

    await invalidateWorkspaceDashboard(workspace.id);
    eventPublisher.publish({ type: 'workspace.created', workspaceId: workspace.id, actorId: req.user!.id });
    res.status(201).json({ workspace });
  } catch (error) {
    next(error);
  }
});

workspacesRouter.get('/', async (req: Request, res: Response, next) => {
  try {
    const memberships = await prisma.membership.findMany({
      where: { userId: req.user!.id },
    });

    const workspaces = await Promise.all(
      memberships.map(async (membership) => {
        const workspace = await prisma.workspace.findUnique({ where: { id: membership.workspaceId } });
        return {
          workspaceId: membership.workspaceId,
          role: membership.role,
          name: workspace?.name ?? '',
        };
      }),
    );

    res.json({ workspaces });
  } catch (error) {
    next(error);
  }
});

workspacesRouter.get('/:workspaceId', requireWorkspaceMember, requirePermission('workspace.read'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    res.json({ workspace });
  } catch (error) {
    next(error);
  }
});

workspacesRouter.get('/:workspaceId/dashboard', requireWorkspaceMember, requirePermission('workspace.read'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const key = workspaceDashboardKey(workspaceId);
    const dashboard = await getOrSet(key, 60, async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [tasks, members, activity, boards, lists, activityCount7d] = await Promise.all([
        prisma.task.findMany({
          where: { workspaceId },
          select: { id: true, status: true, assigneeId: true, dueDate: true, listId: true },
        }),
        prisma.membership.findMany({
          where: { workspaceId },
          select: { userId: true, role: true },
        }),
        prisma.activityLog.findMany({
          where: { workspaceId },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        prisma.board.findMany({
          where: { workspaceId },
          select: { id: true, name: true },
        }),
        prisma.list.findMany({ where: { workspaceId }, select: { id: true, name: true, boardId: true, board: { select: { name: true } } }, orderBy: { position: 'asc' } }),
        prisma.activityLog.count({ where: { workspaceId, createdAt: { gte: sevenDaysAgo } } }),
      ]);

      const byStatus = {
        TODO: tasks.filter((task) => task.status === 'TODO').length,
        IN_PROGRESS: tasks.filter((task) => task.status === 'IN_PROGRESS').length,
        DONE: tasks.filter((task) => task.status === 'DONE').length,
      };

      const overdueCount = tasks.filter((task) => task.dueDate && task.dueDate < new Date() && task.status !== 'DONE').length;
      const tasksByList = lists.map((list) => ({
        listId: list.id,
        listName: list.name,
        boardName: list.board.name,
        count: tasks.filter((task) => task.listId === list.id).length,
      }));
      const topAssignees = Object.entries(
        tasks.reduce<Record<string, number>>((acc, task) => {
          if (task.assigneeId) {
            acc[task.assigneeId] = (acc[task.assigneeId] ?? 0) + 1;
          }
          return acc;
        }, {}),
      )
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([userId, count]) => ({ userId, count }));

      return {
        workspaceId,
        totalBoards: boards.length,
        totalMembers: members.length,
        totalTasks: tasks.length,
        byStatus,
        tasksByList,
        overdueCount,
        activityCount7d,
        topAssignees,
        recentActivity: activity,
        generatedAt: new Date().toISOString(),
      };
    });

    res.set('X-Cache', dashboard.cacheStatus);
    res.json(dashboard.value);
  } catch (error) {
    next(error);
  }
});

workspacesRouter.post('/:workspaceId/digest/send', requireWorkspaceMember, requirePermission('digest.trigger'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const recipients = await prisma.membership.findMany({
      where: { workspaceId, role: { in: ['OWNER', 'ADMIN'] } },
      include: { user: { select: { email: true } } },
    });

    await enqueueDailyDigest(
      workspaceId,
      recipients.map((membership) => membership.user.email).filter(Boolean),
    );

    await invalidateWorkspaceDashboard(workspaceId);
    res.status(202).json({ queued: true, workspaceId });
  } catch (error) {
    next(error);
  }
});

workspacesRouter.get('/:workspaceId/activity', requireWorkspaceMember, requirePermission('workspace.read'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const query = activityListSchema.parse(req.query);

    const rows = await prisma.activityLog.findMany({
      where: {
        workspaceId,
        ...(query.actorId ? { actorId: query.actorId } : {}),
        ...(query.action ? { action: { contains: query.action, mode: 'insensitive' } } : {}),
      },
      include: {
        actor: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : undefined,
    });

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;

    res.json({
      items: items.map((entry) => ({
        id: entry.id,
        workspaceId: entry.workspaceId,
        actorId: entry.actorId,
        actor: entry.actor,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: entry.metadata,
        createdAt: entry.createdAt,
      })),
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
      hasMore,
    });
  } catch (error) {
    next(error);
  }
});

workspacesRouter.get('/:workspaceId/search', requireWorkspaceMember, requirePermission('workspace.read'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const query = taskSearchSchema.parse(req.query);
    const result = await searchWorkspaceTasks(workspaceId, query);

    res.json({
      items: result.items,
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(result.total / query.pageSize)),
    });
  } catch (error) {
    next(error);
  }
});

workspacesRouter.get('/:workspaceId/tasks/search', requireWorkspaceMember, requirePermission('workspace.read'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const query = taskSearchSchema.parse(req.query);
    const result = await searchWorkspaceTasks(workspaceId, query);

    res.json({
      items: result.items,
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(result.total / query.pageSize)),
    });
  } catch (error) {
    next(error);
  }
});

workspacesRouter.patch('/:workspaceId', requireWorkspaceMember, requirePermission('workspace.update'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const payload = updateWorkspaceSchema.parse(req.body);
    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: payload,
    });
    res.json({ workspace });
  } catch (error) {
    next(error);
  }
});

workspacesRouter.delete('/:workspaceId', requireWorkspaceMember, requirePermission('workspace.delete'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    await prisma.workspace.delete({ where: { id: workspaceId } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

workspacesRouter.get('/:workspaceId/members', requireWorkspaceMember, requirePermission('member.list'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const memberships = await prisma.membership.findMany({
      where: { workspaceId },
      include: { user: { select: { email: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const members = memberships.map((membership) => ({
      workspaceId: membership.workspaceId,
      userId: membership.userId,
      role: membership.role,
      email: membership.user.email,
      name: membership.user.name,
      createdAt: membership.createdAt,
    }));
    res.json({ members });
  } catch (error) {
    next(error);
  }
});

workspacesRouter.patch('/:workspaceId/members/:userId', requireWorkspaceMember, requirePermission('member.changeRole'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const userId = getRequiredParam(req.params.userId, 'userId');
    const target = await prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });

    if (!target) throw new AppError(404, 'NOT_FOUND', 'Member not found');

    const { role } = memberRoleSchema.parse(req.body);
    if (!canChangeRole(req.membership!.role, target.role, role)) {
      throw new AppError(403, 'FORBIDDEN', 'You cannot change this member role');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.membership.update({
        where: { workspaceId_userId: { workspaceId, userId } },
        data: { role },
      });
      await recordActivity(tx, {
        workspaceId,
        actorId: req.user!.id,
        action: 'member.role_changed',
        entityType: 'membership',
        entityId: result.id,
        metadata: { userId, role },
      });
      return result;
    });

    await invalidateWorkspaceDashboard(workspaceId);
    eventPublisher.publish({
      type: 'member.role_changed',
      workspaceId,
      userId,
      actorId: req.user!.id,
      role,
    });

    res.json({ member: updated });
  } catch (error) {
    next(error);
  }
});

workspacesRouter.delete('/:workspaceId/members/:userId', requireWorkspaceMember, requirePermission('member.remove'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const userId = getRequiredParam(req.params.userId, 'userId');
    const target = await prisma.membership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });

    if (!target) throw new AppError(404, 'NOT_FOUND', 'Member not found');

    if (!canRemoveMember(req.membership!.role, target.role, userId === req.user!.id)) {
      throw new AppError(403, 'FORBIDDEN', 'You cannot remove this member');
    }

    await prisma.$transaction(async (tx) => {
      await tx.membership.delete({
        where: { workspaceId_userId: { workspaceId, userId } },
      });
      await recordActivity(tx, {
        workspaceId,
        actorId: req.user!.id,
        action: 'member.removed',
        entityType: 'membership',
        entityId: userId,
        metadata: { removedUserId: userId },
      });
    });

    await invalidateWorkspaceDashboard(workspaceId);
    eventPublisher.publish({
      type: 'member.removed',
      workspaceId,
      userId,
      actorId: req.user!.id,
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

workspacesRouter.post('/:workspaceId/invitations', requireWorkspaceMember, requirePermission('member.invite'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const payload = inviteSchema.parse(req.body);
    if (!canInviteRole(req.membership!.role, payload.role)) {
      throw new AppError(403, 'FORBIDDEN', 'You cannot invite that role');
    }

    const existingUser = await prisma.user.findUnique({ where: { email: payload.email.toLowerCase() } });
    if (existingUser) {
      const existingMembership = await prisma.membership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: existingUser.id } },
      });
      if (existingMembership) {
        throw new AppError(409, 'ALREADY_MEMBER', 'This user is already a member');
      }
    }

    const pending = await prisma.invitation.findFirst({
      where: {
        workspaceId,
        email: payload.email.toLowerCase(),
        revokedAt: null,
        acceptedAt: null,
      },
    });

    if (pending) {
      throw new AppError(409, 'INVITE_EXISTS', 'A pending invite already exists');
    }

    const inviteToken = generateInvitationToken();
    const invitation = await prisma.$transaction(async (tx) => {
      const created = await tx.invitation.create({
        data: {
          workspaceId,
          email: payload.email.toLowerCase(),
          role: payload.role,
          tokenHash: hashToken(inviteToken),
          invitedById: req.user!.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
      await recordActivity(tx, {
        workspaceId,
        actorId: req.user!.id,
        action: 'member.invited',
        entityType: 'invitation',
        entityId: created.id,
        metadata: { email: payload.email.toLowerCase(), role: payload.role },
      });
      return created;
    });

    const acceptLink = `${env.FRONTEND_URL}/invite/${inviteToken}`;
    await enqueueInviteEmail(invitation.id, payload.email.toLowerCase(), acceptLink);

    eventPublisher.publish({
      type: 'member.invited',
      workspaceId,
      userId: req.user!.id,
      actorId: req.user!.id,
      targetEmail: payload.email.toLowerCase(),
      role: payload.role,
    });

    const safeInvitation = {
      id: invitation.id,
      workspaceId: invitation.workspaceId,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      acceptedAt: invitation.acceptedAt,
      revokedAt: invitation.revokedAt,
      createdAt: invitation.createdAt,
    };
    const response: { invitation: typeof safeInvitation; token?: string; acceptLink?: string } = { invitation: safeInvitation };
    if (process.env.EXPOSE_INVITE_LINKS === 'true') {
      Object.assign(response, {
        token: inviteToken,
        acceptLink,
      });
    }

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
});

workspacesRouter.get('/:workspaceId/labels', requireWorkspaceMember, requirePermission('workspace.read'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const labels = await prisma.label.findMany({ where: { workspaceId }, orderBy: { name: 'asc' } });
    res.json({ labels });
  } catch (error) { next(error); }
});

workspacesRouter.post('/:workspaceId/labels', requireWorkspaceMember, requirePermission('label.write'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const payload = labelCreateSchema.parse(req.body);
    const label = await prisma.$transaction(async (tx) => {
      const created = await tx.label.create({ data: { workspaceId, ...payload } });
      await recordActivity(tx, { workspaceId, actorId: req.user!.id, action: 'label.created', entityType: 'label', entityId: created.id });
      return created;
    });
    eventPublisher.publish({ type: 'label.created', workspaceId, actorId: req.user!.id });
    res.status(201).json({ label });
  } catch (error) { next(error); }
});

workspacesRouter.patch('/:workspaceId/labels/:labelId', requireWorkspaceMember, requirePermission('label.write'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const labelId = getRequiredParam(req.params.labelId, 'labelId');
    const label = await prisma.label.findFirst({ where: { id: labelId, workspaceId } });
    if (!label) throw new AppError(404, 'NOT_FOUND', 'Label not found');
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.label.update({ where: { id: labelId }, data: labelUpdateSchema.parse(req.body) });
      await recordActivity(tx, { workspaceId, actorId: req.user!.id, action: 'label.updated', entityType: 'label', entityId: labelId });
      return result;
    });
    eventPublisher.publish({ type: 'label.updated', workspaceId, actorId: req.user!.id });
    res.json({ label: updated });
  } catch (error) { next(error); }
});

workspacesRouter.delete('/:workspaceId/labels/:labelId', requireWorkspaceMember, requirePermission('label.write'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const labelId = getRequiredParam(req.params.labelId, 'labelId');
    const label = await prisma.label.findFirst({ where: { id: labelId, workspaceId } });
    if (!label) throw new AppError(404, 'NOT_FOUND', 'Label not found');
    await prisma.$transaction(async (tx) => {
      await tx.label.delete({ where: { id: labelId } });
      await recordActivity(tx, { workspaceId, actorId: req.user!.id, action: 'label.deleted', entityType: 'label', entityId: labelId });
    });
    eventPublisher.publish({ type: 'label.deleted', workspaceId, actorId: req.user!.id });
    res.status(204).send();
  } catch (error) { next(error); }
});

workspacesRouter.get('/:workspaceId/boards', requireWorkspaceMember, requirePermission('workspace.read'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const boards = await prisma.board.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ boards });
  } catch (error) {
    next(error);
  }
});

workspacesRouter.post('/:workspaceId/boards', requireWorkspaceMember, requirePermission('board.write'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const payload = boardCreateSchema.parse(req.body);

    const board = await prisma.$transaction(async (tx) => {
      const created = await tx.board.create({
        data: {
          workspaceId,
          name: payload.name,
          description: payload.description ?? null,
          createdById: req.user!.id,
        },
      });

      await recordActivity(tx, {
        workspaceId,
        actorId: req.user!.id,
        action: 'board.created',
        entityType: 'board',
        entityId: created.id,
      });

      return created;
    });

    await invalidateWorkspaceDashboard(workspaceId);
    eventPublisher.publish({
      type: 'board.created',
      workspaceId,
      boardId: board.id,
      actorId: req.user!.id,
    });

    res.status(201).json({ board });
  } catch (error) {
    next(error);
  }
});

workspacesRouter.get('/:workspaceId/boards/:boardId', requireWorkspaceMember, requirePermission('workspace.read'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const boardId = getRequiredParam(req.params.boardId, 'boardId');
    const board = await getBoardForWorkspace(workspaceId, boardId);
    res.json({ board });
  } catch (error) {
    next(error);
  }
});

workspacesRouter.patch('/:workspaceId/boards/:boardId', requireWorkspaceMember, requirePermission('board.write'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const boardId = getRequiredParam(req.params.boardId, 'boardId');
    const payload = boardUpdateSchema.parse(req.body);
    await getBoardForWorkspace(workspaceId, boardId);

    const board = await prisma.$transaction(async (tx) => {
      const updated = await tx.board.update({
        where: { id: boardId },
        data: {
          ...(payload.name ? { name: payload.name } : {}),
          ...(payload.description !== undefined ? { description: payload.description ?? null } : {}),
        },
      });

      await recordActivity(tx, {
        workspaceId,
        actorId: req.user!.id,
        action: 'board.updated',
        entityType: 'board',
        entityId: updated.id,
      });

      return updated;
    });

    await invalidateWorkspaceDashboard(workspaceId);
    eventPublisher.publish({
      type: 'board.updated',
      workspaceId,
      boardId,
      actorId: req.user!.id,
    });

    res.json({ board });
  } catch (error) {
    next(error);
  }
});

workspacesRouter.delete('/:workspaceId/boards/:boardId', requireWorkspaceMember, requirePermission('board.delete'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const boardId = getRequiredParam(req.params.boardId, 'boardId');
    await getBoardForWorkspace(workspaceId, boardId);

    await prisma.$transaction(async (tx) => {
      await tx.board.delete({ where: { id: boardId } });
      await recordActivity(tx, {
        workspaceId,
        actorId: req.user!.id,
        action: 'board.deleted',
        entityType: 'board',
        entityId: boardId,
      });
    });

    await invalidateWorkspaceDashboard(workspaceId);
    eventPublisher.publish({
      type: 'board.deleted',
      workspaceId,
      boardId,
      actorId: req.user!.id,
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

workspacesRouter.get('/:workspaceId/boards/:boardId/lists', requireWorkspaceMember, requirePermission('workspace.read'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const boardId = getRequiredParam(req.params.boardId, 'boardId');
    await getBoardForWorkspace(workspaceId, boardId);

    const lists = await prisma.list.findMany({
      where: { workspaceId, boardId },
      orderBy: { position: 'asc' },
      include: { tasks: { orderBy: { position: 'asc' }, include: { labels: { include: { label: true } } } } },
    });

    res.json({ lists });
  } catch (error) {
    next(error);
  }
});

workspacesRouter.post('/:workspaceId/boards/:boardId/lists', requireWorkspaceMember, requirePermission('list.write'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const boardId = getRequiredParam(req.params.boardId, 'boardId');
    const payload = listCreateSchema.parse(req.body);
    await getBoardForWorkspace(workspaceId, boardId);

    const list = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Board" WHERE "id" = ${boardId}::uuid FOR UPDATE`);
      const lastList = await tx.list.findFirst({ where: { workspaceId, boardId }, orderBy: { position: 'desc' } });
      const created = await tx.list.create({
        data: {
          workspaceId,
          boardId,
          name: payload.name,
          position: positionBetween(lastList ? lastList.position : null, null),
        },
      });

      await recordActivity(tx, {
        workspaceId,
        actorId: req.user!.id,
        action: 'list.created',
        entityType: 'list',
        entityId: created.id,
      });

      return created;
    });

    await invalidateWorkspaceDashboard(workspaceId);
    eventPublisher.publish({
      type: 'list.created',
      workspaceId,
      boardId,
      listId: list.id,
      actorId: req.user!.id,
    });

    res.status(201).json({ list });
  } catch (error) {
    next(error);
  }
});

workspacesRouter.patch('/:workspaceId/boards/:boardId/lists/:listId', requireWorkspaceMember, requirePermission('list.write'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const boardId = getRequiredParam(req.params.boardId, 'boardId');
    const listId = getRequiredParam(req.params.listId, 'listId');
    const payload = listUpdateSchema.parse(req.body);
    const list = await getListForBoard(workspaceId, boardId, listId);

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.list.update({
        where: { id: list.id },
        data: {
          ...(payload.name ? { name: payload.name } : {}),
        },
      });

      await recordActivity(tx, {
        workspaceId,
        actorId: req.user!.id,
        action: 'list.updated',
        entityType: 'list',
        entityId: result.id,
      });

      return result;
    });

    await invalidateWorkspaceDashboard(workspaceId);
    eventPublisher.publish({
      type: 'list.updated',
      workspaceId,
      boardId,
      listId: updated.id,
      actorId: req.user!.id,
    });

    res.json({ list: updated });
  } catch (error) {
    next(error);
  }
});

workspacesRouter.patch('/:workspaceId/boards/:boardId/lists/:listId/move', requireWorkspaceMember, requirePermission('list.write'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const boardId = getRequiredParam(req.params.boardId, 'boardId');
    const listId = getRequiredParam(req.params.listId, 'listId');
    await getListForBoard(workspaceId, boardId, listId);
    const { afterListId = null } = listMoveSchema.parse(req.body);

    const moved = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Board" WHERE "id" = ${boardId}::uuid FOR UPDATE`);
      const lists = await tx.list.findMany({ where: { workspaceId, boardId, id: { not: listId } }, orderBy: { position: 'asc' } });
      const anchor = afterListId ? lists.find((list) => list.id === afterListId) : null;
      if (afterListId && !anchor) throw new AppError(409, 'STALE_POSITION', 'Target list no longer exists on this board');
      const next = anchor ? lists.find((list) => list.position > anchor.position) : lists[0] ?? null;
      const updated = await tx.list.update({ where: { id: listId }, data: { position: positionBetween(anchor?.position ?? null, next?.position ?? null) } });
      await recordActivity(tx, { workspaceId, actorId: req.user!.id, action: 'list.moved', entityType: 'list', entityId: listId });
      return updated;
    });

    eventPublisher.publish({ type: 'list.moved', workspaceId, boardId, listId, actorId: req.user!.id });
    res.json({ list: moved });
  } catch (error) { next(error); }
});

workspacesRouter.delete('/:workspaceId/boards/:boardId/lists/:listId', requireWorkspaceMember, requirePermission('list.write'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const boardId = getRequiredParam(req.params.boardId, 'boardId');
    const listId = getRequiredParam(req.params.listId, 'listId');
    await getListForBoard(workspaceId, boardId, listId);

    await prisma.$transaction(async (tx) => {
      await tx.list.delete({ where: { id: listId } });
      await recordActivity(tx, {
        workspaceId,
        actorId: req.user!.id,
        action: 'list.deleted',
        entityType: 'list',
        entityId: listId,
      });
    });

    await invalidateWorkspaceDashboard(workspaceId);
    eventPublisher.publish({
      type: 'list.deleted',
      workspaceId,
      boardId,
      listId,
      actorId: req.user!.id,
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

workspacesRouter.post('/:workspaceId/boards/:boardId/lists/:listId/tasks', requireWorkspaceMember, requirePermission('task.write'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const boardId = getRequiredParam(req.params.boardId, 'boardId');
    const listId = getRequiredParam(req.params.listId, 'listId');
    const payload = taskCreateSchema.parse(req.body);
    await getListForBoard(workspaceId, boardId, listId);

    if (payload.assigneeId) {
      const assigneeMembership = await prisma.membership.findFirst({
        where: { userId: payload.assigneeId, workspaceId },
      });
      if (!assigneeMembership) {
        throw new AppError(400, 'INVALID_ASSIGNEE', 'Assignee must be a member of this workspace');
      }
    }

    if (payload.labelIds?.length) {
      const labels = await prisma.label.findMany({ where: { id: { in: payload.labelIds }, workspaceId }, select: { id: true } });
      if (labels.length !== payload.labelIds.length) throw new AppError(400, 'INVALID_LABEL', 'Every label must belong to this workspace');
    }

    const task = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "List" WHERE "id" = ${listId}::uuid FOR UPDATE`);
      const lastTask = await tx.task.findFirst({ where: { workspaceId, boardId, listId }, orderBy: { position: 'desc' } });
      const created = await tx.task.create({
        data: {
          workspaceId,
          boardId,
          listId,
          title: payload.title,
          description: payload.description ?? null,
          status: payload.status ?? 'TODO',
          position: positionBetween(lastTask ? lastTask.position : null, null),
          assigneeId: payload.assigneeId ?? null,
          createdById: req.user!.id,
          dueDate: payload.dueDate ?? null,
        },
      });

      if (payload.labelIds?.length) {
        await tx.taskLabel.createMany({ data: payload.labelIds.map((labelId) => ({ taskId: created.id, labelId })) });
      }

      await recordActivity(tx, {
        workspaceId,
        actorId: req.user!.id,
        action: 'task.created',
        entityType: 'task',
        entityId: created.id,
      });

      return (await tx.task.findUnique({ where: { id: created.id }, include: { labels: { include: { label: true } } } })) ?? created;
    });

    await invalidateWorkspaceDashboard(workspaceId);
    eventPublisher.publish({
      type: 'task.created',
      workspaceId,
      boardId,
      listId,
      taskId: task.id,
      actorId: req.user!.id,
    });

    res.status(201).json({ task });
  } catch (error) {
    next(error);
  }
});

workspacesRouter.get('/:workspaceId/boards/:boardId/tasks/:taskId', requireWorkspaceMember, requirePermission('workspace.read'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const boardId = getRequiredParam(req.params.boardId, 'boardId');
    const taskId = getRequiredParam(req.params.taskId, 'taskId');
    const task = await getTaskForBoard(workspaceId, boardId, taskId);
    res.json({ task });
  } catch (error) {
    next(error);
  }
});

workspacesRouter.patch('/:workspaceId/boards/:boardId/tasks/:taskId', requireWorkspaceMember, requirePermission('task.write'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const boardId = getRequiredParam(req.params.boardId, 'boardId');
    const taskId = getRequiredParam(req.params.taskId, 'taskId');
    const payload = taskUpdateSchema.parse(req.body);
    const task = await getTaskForBoard(workspaceId, boardId, taskId);

    if (payload.version && payload.version !== task.version) {
      throw new AppError(409, 'VERSION_MISMATCH', 'Task version does not match current version');
    }

    if (payload.assigneeId) {
      const assigneeMembership = await prisma.membership.findFirst({
        where: { userId: payload.assigneeId, workspaceId },
      });
      if (!assigneeMembership) {
        throw new AppError(400, 'INVALID_ASSIGNEE', 'Assignee must be a member of this workspace');
      }
    }

    if (payload.labelIds !== undefined) {
      const labels = await prisma.label.findMany({ where: { id: { in: payload.labelIds }, workspaceId }, select: { id: true } });
      if (labels.length !== payload.labelIds.length) throw new AppError(400, 'INVALID_LABEL', 'Every label must belong to this workspace');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.task.updateMany({
        where: {
          id: taskId,
          workspaceId,
          boardId,
          ...(payload.version !== undefined ? { version: payload.version } : {}),
        },
        data: {
          ...(payload.title ? { title: payload.title } : {}),
          ...(payload.description !== undefined ? { description: payload.description ?? null } : {}),
          ...(payload.status ? { status: payload.status } : {}),
          ...(payload.assigneeId !== undefined ? { assigneeId: payload.assigneeId ?? null } : {}),
          ...(payload.dueDate !== undefined ? { dueDate: payload.dueDate ?? null } : {}),
          version: { increment: 1 },
        },
      });
      if (result.count === 0) {
        const latest = await tx.task.findFirst({ where: { id: taskId, workspaceId, boardId } });
        throw new AppError(409, 'VERSION_MISMATCH', 'Task version does not match current version', latest);
      }

      if (payload.labelIds !== undefined) {
        await tx.taskLabel.deleteMany({ where: { taskId } });
        if (payload.labelIds.length) {
          await tx.taskLabel.createMany({ data: payload.labelIds.map((labelId) => ({ taskId, labelId })) });
        }
      }

      await recordActivity(tx, {
        workspaceId,
        actorId: req.user!.id,
        action: 'task.updated',
        entityType: 'task',
        entityId: taskId,
      });

      return (await tx.task.findUnique({ where: { id: taskId }, include: { labels: { include: { label: true } } } }))!;
    });

    await invalidateWorkspaceDashboard(workspaceId);
    eventPublisher.publish({
      type: 'task.updated',
      workspaceId,
      boardId,
      listId: updated.listId,
      taskId: updated.id,
      actorId: req.user!.id,
    });

    res.json({ task: updated });
  } catch (error) {
    next(error);
  }
});

workspacesRouter.patch('/:workspaceId/boards/:boardId/tasks/:taskId/move', requireWorkspaceMember, requirePermission('task.write'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const boardId = getRequiredParam(req.params.boardId, 'boardId');
    const taskId = getRequiredParam(req.params.taskId, 'taskId');
    const payload = taskMoveSchema.parse(req.body);
    const task = await getTaskForBoard(workspaceId, boardId, taskId);

    const targetListId = payload.listId ?? task.listId;
    await getListForBoard(workspaceId, boardId, targetListId);

    const afterTaskId = payload.afterTaskId ?? null;

    const moved = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Task" WHERE "id" = ${taskId}::uuid FOR UPDATE`);
      const currentTask = await tx.task.findUnique({ where: { id: taskId } });
      if (!currentTask || currentTask.workspaceId !== workspaceId || currentTask.boardId !== boardId) {
        throw new AppError(404, 'NOT_FOUND', 'Task not found');
      }

      if (payload.version && payload.version !== currentTask.version) {
        throw new AppError(409, 'VERSION_MISMATCH', 'Task version does not match current version');
      }

      const sourceListId = currentTask.listId;
      for (const listId of [...new Set([sourceListId, targetListId])].sort()) {
        await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "List" WHERE "id" = ${listId}::uuid FOR UPDATE`);
      }

      const targetTasks = await tx.task.findMany({
        where: { workspaceId, boardId, listId: targetListId, id: { not: taskId } },
        orderBy: { position: 'asc' },
      });

      const anchor = afterTaskId ? targetTasks.find((candidate) => candidate.id === afterTaskId) : null;
      if (afterTaskId && !anchor) {
        throw new AppError(409, 'STALE_POSITION', 'Target task no longer exists in the destination list');
      }

      const prevPosition = anchor ? anchor.position : null;
      const nextTask = anchor ? targetTasks.filter((candidate) => candidate.position > anchor.position)[0] ?? null : null;
      const nextPosition = nextTask ? nextTask.position : null;
      const newPosition = positionBetween(prevPosition, nextPosition);

      const updated = await tx.task.update({
        where: { id: taskId },
        data: {
          listId: targetListId,
          position: newPosition,
          version: { increment: 1 },
        },
      });

      await recordActivity(tx, {
        workspaceId,
        actorId: req.user!.id,
        action: 'task.moved',
        entityType: 'task',
        entityId: updated.id,
        metadata: { fromListId: sourceListId, toListId: targetListId },
      });

      return updated;
    });

    await invalidateWorkspaceDashboard(workspaceId);
    eventPublisher.publish({
      type: 'task.moved',
      workspaceId,
      boardId,
      listId: moved.listId,
      taskId: moved.id,
      actorId: req.user!.id,
    });

    res.json({ task: moved });
  } catch (error) {
    next(error);
  }
});

workspacesRouter.delete('/:workspaceId/boards/:boardId/tasks/:taskId', requireWorkspaceMember, requirePermission('task.write'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const boardId = getRequiredParam(req.params.boardId, 'boardId');
    const taskId = getRequiredParam(req.params.taskId, 'taskId');
    const task = await getTaskForBoard(workspaceId, boardId, taskId);

    await prisma.$transaction(async (tx) => {
      await tx.task.delete({ where: { id: taskId } });
      await recordActivity(tx, {
        workspaceId,
        actorId: req.user!.id,
        action: 'task.deleted',
        entityType: 'task',
        entityId: task.id,
      });
    });

    await invalidateWorkspaceDashboard(workspaceId);
    eventPublisher.publish({
      type: 'task.deleted',
      workspaceId,
      boardId,
      listId: task.listId,
      taskId: task.id,
      actorId: req.user!.id,
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

workspacesRouter.get('/:workspaceId/invitations', requireWorkspaceMember, requirePermission('member.list'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const invitations = await prisma.invitation.findMany({
      where: { workspaceId, revokedAt: null, acceptedAt: null },
      select: { id: true, workspaceId: true, email: true, role: true, expiresAt: true, acceptedAt: true, revokedAt: true, createdAt: true },
    });
    res.json({ invitations });
  } catch (error) {
    next(error);
  }
});

workspacesRouter.delete('/:workspaceId/invitations/:invitationId', requireWorkspaceMember, requirePermission('member.invite'), async (req: Request, res: Response, next) => {
  try {
    const workspaceId = getRequiredParam(req.params.workspaceId, 'workspaceId');
    const invitationId = getRequiredParam(req.params.invitationId, 'invitationId');
    const invitation = await prisma.invitation.findFirst({ where: { id: invitationId, workspaceId, acceptedAt: null, revokedAt: null } });
    if (!invitation) throw new AppError(404, 'NOT_FOUND', 'Invitation not found');

    await prisma.$transaction(async (tx) => {
      await tx.invitation.update({ where: { id: invitationId }, data: { revokedAt: new Date() } });
      await recordActivity(tx, { workspaceId, actorId: req.user!.id, action: 'invitation.revoked', entityType: 'invitation', entityId: invitationId });
    });

    await invalidateWorkspaceDashboard(workspaceId);
    eventPublisher.publish({
      type: 'invitation.revoked',
      workspaceId,
      invitationId,
      actorId: req.user!.id,
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

workspacesRouter.post('/accept', authenticate, async (req: Request, res: Response, next) => {
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

export default workspacesRouter;
