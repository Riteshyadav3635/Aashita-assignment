import { PrismaClient } from '@prisma/client';
import { positionBetween } from '../src/lib/ordering.js';

const prisma = new PrismaClient();

const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && process.env.ALLOW_SEED !== 'true') {
  throw new Error('Seeding is disabled in production unless ALLOW_SEED=true');
}

const demoUsers = [
  { email: 'owner@example.com', name: 'Demo Owner', role: 'OWNER', password: 'Passw0rd!demo' },
  { email: 'admin@example.com', name: 'Demo Admin', role: 'ADMIN', password: 'Passw0rd!demo' },
  { email: 'member@example.com', name: 'Demo Member', role: 'MEMBER', password: 'Passw0rd!demo' },
  { email: 'viewer@example.com', name: 'Demo Viewer', role: 'VIEWER', password: 'Passw0rd!demo' },
] as const;

const otherOrgUsers = [
  { email: 'other@example.com', name: 'Other Owner', role: 'OWNER', password: 'Passw0rd!demo' },
] as const;

const labels = [
  { name: 'Urgent', color: '#f87171' },
  { name: 'Design', color: '#38bdf8' },
  { name: 'Backend', color: '#a78bfa' },
  { name: 'QA', color: '#34d399' },
] as const;

const taskTitles = [
  'Review onboarding copy',
  'Fix auth refresh edge case',
  'Design sprint board labels',
  'Prepare release checklist',
  'Create activity filters',
  'Audit RBAC matrix',
  'Improve search result ordering',
  'Draft user invite copy',
  'Test board drag and drop',
  'Document API health checks',
  'Review performance logs',
  'Ship dashboard summary',
];

const taskDescriptions = [
  'Review the current onboarding flow for clarity and consistency.',
  'Verify refresh rotation and expired session handling across browsers.',
  'Align label color choices with the workspace branding guidelines.',
  'Prepare a release checklist for the next sprint handoff.',
  'Validate activity filters against actor and action combinations.',
  'Confirm the permission matrix covers all mutating endpoints.',
  'Check ordering stability when multiple tasks are moved in parallel.',
  'Write invite instructions for the team before launch.',
  'Verify drag-and-drop behavior across list boundaries and board updates.',
  'Document the health and readiness endpoints for ops.',
  'Review the latest dashboard metrics for anomalies and outliers.',
  'Finalize the summary cards and status breakdown.',
];

async function hashPassword(password: string) {
  const { hash } = await import('argon2');
  return hash(password);
}

async function ensureUser(user: { email: string; name: string; password: string }) {
  const existing = await prisma.user.findUnique({ where: { email: user.email } });
  if (existing) {
    return existing;
  }

  return prisma.user.create({
    data: {
      email: user.email,
      name: user.name,
      passwordHash: await hashPassword(user.password),
    },
  });
}

async function ensureMembership(workspaceId: string, userId: string, role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER') {
  return prisma.membership.upsert({
    where: {
      workspaceId_userId: { workspaceId, userId },
    },
    update: { role },
    create: { workspaceId, userId, role },
  });
}

async function seedDemoWorkspace() {
  const workspace = await prisma.workspace.upsert({
    where: { id: '00000000-0000-0000-0000-000000000100' },
    update: { name: 'Demo Workspace' },
    create: {
      id: '00000000-0000-0000-0000-000000000100',
      name: 'Demo Workspace',
    },
  });

  const createdUsers: Record<string, { id: string; email: string; name: string }> = {};
  for (const user of demoUsers) {
    const record = await ensureUser(user);
    createdUsers[user.email] = record;
    await ensureMembership(workspace.id, record.id, user.role);
  }

  const ownerId = createdUsers['owner@example.com']!.id;
  const board = await prisma.board.upsert({
    where: { id: '00000000-0000-0000-0000-000000000110' },
    update: { name: 'Sprint Board', description: 'Demo workspace sprint board' },
    create: {
      id: '00000000-0000-0000-0000-000000000110',
      workspaceId: workspace.id,
      name: 'Sprint Board',
      description: 'Demo workspace sprint board',
      createdById: ownerId,
    },
  });

  const listNames = ['To Do', 'In Progress', 'Done'];
  const listIds: string[] = [];
  for (const [index, name] of listNames.entries()) {
    const list = await prisma.list.upsert({
      where: { id: `00000000-0000-0000-0000-${(0x111 + index).toString(16).padStart(12, '0')}` },
      update: { name },
      create: {
        id: `00000000-0000-0000-0000-${(0x111 + index).toString(16).padStart(12, '0')}`,
        workspaceId: workspace.id,
        boardId: board.id,
        name,
        position: String.fromCharCode(97 + index),
      },
    });
    listIds.push(list.id);
  }

  for (const label of labels) {
    await prisma.label.upsert({
      where: { workspaceId_name: { workspaceId: workspace.id, name: label.name } },
      update: { color: label.color },
      create: { workspaceId: workspace.id, name: label.name, color: label.color },
    });
  }

  const labelRows = await prisma.label.findMany({ where: { workspaceId: workspace.id } });

  let previousPosition: string | null = null;
  for (let i = 0; i < taskTitles.length; i += 1) {
    const listId = listIds[i % listIds.length]!;
    const status = listId === listIds[0] ? 'TODO' : listId === listIds[1] ? 'IN_PROGRESS' : 'DONE';
    const assignee = demoUsers[i % demoUsers.length]!;
    const assigneeUser = createdUsers[assignee.email]!;
    const taskPosition: string = previousPosition ? positionBetween(previousPosition, null) : 'a0';
    const task = await prisma.task.upsert({
      where: { id: `00000000-0000-0000-0000-${(0x200 + i).toString(16).padStart(12, '0')}` },
      update: {
        title: taskTitles[i]!,
        description: taskDescriptions[i]!,
        status,
        listId,
        assigneeId: assigneeUser.id,
        dueDate: new Date(Date.now() + (i - 2) * 86400000),
        position: taskPosition,
      },
      create: {
        id: `00000000-0000-0000-0000-${(0x200 + i).toString(16).padStart(12, '0')}`,
        workspaceId: workspace.id,
        boardId: board.id,
        listId,
        title: taskTitles[i]!,
        description: taskDescriptions[i]!,
        status,
        position: taskPosition,
        assigneeId: assigneeUser.id,
        createdById: ownerId,
        dueDate: new Date(Date.now() + (i - 2) * 86400000),
      },
    });

    const label = labelRows[i % labelRows.length]!;
    await prisma.taskLabel.upsert({
      where: { taskId_labelId: { taskId: task.id, labelId: label.id } },
      update: {},
      create: { taskId: task.id, labelId: label.id },
    });

    await prisma.activityLog.upsert({
      where: { id: `00000000-0000-0000-0000-${(0x300 + i).toString(16).padStart(12, '0')}` },
      update: {
        action: 'task.created',
        entityType: 'task',
        entityId: task.id,
        metadata: { title: task.title },
      },
      create: {
        id: `00000000-0000-0000-0000-${(0x300 + i).toString(16).padStart(12, '0')}`,
        workspaceId: workspace.id,
        actorId: ownerId,
        action: 'task.created',
        entityType: 'task',
        entityId: task.id,
        metadata: { title: task.title },
      },
    });

    previousPosition = taskPosition;
  }

  return workspace;
}

async function seedOtherOrg() {
  const workspace = await prisma.workspace.upsert({
    where: { id: '00000000-0000-0000-0000-000000000200' },
    update: { name: 'Other Org' },
    create: {
      id: '00000000-0000-0000-0000-000000000200',
      name: 'Other Org',
    },
  });

  const user = await ensureUser(otherOrgUsers[0]);
  await ensureMembership(workspace.id, user.id, 'OWNER');

  const board = await prisma.board.upsert({
    where: { id: '00000000-0000-0000-0000-000000000210' },
    update: { name: 'Ops Board' },
    create: {
      id: '00000000-0000-0000-0000-000000000210',
      workspaceId: workspace.id,
      name: 'Ops Board',
      description: 'Cross-tenant demo board',
      createdById: user.id,
    },
  });

  const list = await prisma.list.upsert({
    where: { id: '00000000-0000-0000-0000-000000000220' },
    update: { name: 'Inbox' },
    create: {
      id: '00000000-0000-0000-0000-000000000220',
      workspaceId: workspace.id,
      boardId: board.id,
      name: 'Inbox',
      position: 'a0',
    },
  });

  const task = await prisma.task.upsert({
    where: { id: '00000000-0000-0000-0000-000000000230' },
    update: { title: 'Other workspace task' },
    create: {
      id: '00000000-0000-0000-0000-000000000230',
      workspaceId: workspace.id,
      boardId: board.id,
      listId: list.id,
      title: 'Other workspace task',
      description: 'This task exists in another workspace to confirm tenant isolation.',
      status: 'TODO',
      position: 'a0',
      createdById: user.id,
    },
  });

  await prisma.activityLog.upsert({
    where: { id: '00000000-0000-0000-0000-000000000240' },
    update: { action: 'task.created', entityId: task.id },
    create: {
      id: '00000000-0000-0000-0000-000000000240',
      workspaceId: workspace.id,
      actorId: user.id,
      action: 'task.created',
      entityType: 'task',
      entityId: task.id,
      metadata: { title: task.title },
    },
  });

  return workspace;
}

async function main() {
  await seedDemoWorkspace();
  await seedOtherOrg();

  console.log('\nDemo credentials:');
  console.table([
    { workspace: 'Demo Workspace', email: 'owner@example.com', password: 'Passw0rd!demo', role: 'OWNER' },
    { workspace: 'Demo Workspace', email: 'admin@example.com', password: 'Passw0rd!demo', role: 'ADMIN' },
    { workspace: 'Demo Workspace', email: 'member@example.com', password: 'Passw0rd!demo', role: 'MEMBER' },
    { workspace: 'Demo Workspace', email: 'viewer@example.com', password: 'Passw0rd!demo', role: 'VIEWER' },
    { workspace: 'Other Org', email: 'other@example.com', password: 'Passw0rd!demo', role: 'OWNER' },
  ]);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
