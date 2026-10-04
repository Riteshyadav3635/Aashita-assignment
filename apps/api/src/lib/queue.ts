import { Queue, Worker } from 'bullmq';
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../logger.js';
import { prisma } from './prisma.js';
import { redis } from './redis.js';

export const emailQueue = new Queue('email', {
  connection: redis,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 100,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
});

const transporter = nodemailer.createTransport(env.SMTP_URL);

export async function registerDailyDigestJob() {
  try {
    await emailQueue.upsertJobScheduler('daily-digest', {
      pattern: '0 8 * * *',
      tz: 'UTC',
    }, {
      name: 'daily-digest',
      data: {},
    });
  } catch (error) {
    logger.warn({ err: error }, 'Daily digest scheduler registration failed');
  }
}

export async function enqueueInviteEmail(invitationId: string, email: string, acceptLink: string) {
  try {
    await emailQueue.add('send-invite-email', { invitationId, email, acceptLink }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    });
  } catch (error) {
    logger.warn({ err: error, invitationId, email }, 'Invite email queue failed; request still succeeded');
  }
}

export async function enqueueDailyDigest(workspaceId: string, recipients: string[]) {
  try {
    await emailQueue.add('daily-digest', { workspaceId, recipients }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    });
  } catch (error) {
    logger.warn({ err: error, workspaceId, recipients }, 'Daily digest enqueue failed');
  }
}

export function startEmailWorker() {
  const worker = new Worker(
    'email',
    async (job) => {
      switch (job.name) {
        case 'send-invite-email': {
          const { email, invitationId, acceptLink } = job.data as { email: string; invitationId: string; acceptLink: string };
          await transporter.sendMail({
            from: 'workspace@example.com',
            to: email,
            subject: 'Workspace invite',
            text: `You have a workspace invitation. Accept it here: ${acceptLink}\n\nInvitation reference: ${invitationId}`,
          });
          return true;
        }

        case 'daily-digest': {
          const data = job.data as { recipients?: string[]; workspaceId?: string };
          const workspaces = data.workspaceId
            ? [{ id: data.workspaceId }]
            : await prisma.workspace.findMany({ select: { id: true } });
          const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

          for (const workspace of workspaces) {
            const [recipients, activityCount] = await Promise.all([
              data.recipients
                ? Promise.resolve(data.recipients)
                : prisma.membership.findMany({ where: { workspaceId: workspace.id, role: { in: ['OWNER', 'ADMIN'] } }, include: { user: { select: { email: true } } } }).then((rows) => rows.map((row) => row.user.email)),
              prisma.activityLog.count({ where: { workspaceId: workspace.id, createdAt: { gte: since } } }),
            ]);

            for (const recipient of recipients) {
              await transporter.sendMail({
                from: 'workspace@example.com',
                to: recipient,
                subject: 'Workspace daily digest',
                text: `Recent activity: ${activityCount} updates in the last 24 hours.`,
              });
            }
          }

          return true;
        }

        default:
          return true;
      }
    },
    {
      connection: redis,
      autorun: true,
    },
  );

  worker.on('error', (error) => {
    logger.error({ err: error }, 'BullMQ email worker failed');
  });

  return worker;
}
