import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { AppError } from '../../lib/errors.js';
import { prisma } from '../../lib/prisma.js';
import { generateRefreshToken, hashRefreshToken, issueAccessToken, toPublicUser } from '../../lib/auth.js';

export type SignupInput = {
  email: string;
  name: string;
  password: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type AuthResult = {
  user: ReturnType<typeof toPublicUser>;
  accessToken: string;
  refreshToken: string;
};

export async function signupUser(input: SignupInput): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();

  if (!email || !name || !input.password || input.password.length < 8) {
    throw new AppError(400, 'INVALID_INPUT', 'Email, name and password are required');
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new AppError(409, 'EMAIL_EXISTS', 'An account with this email already exists');
  }

  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
  const user = await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
    },
  });

  return issueSession(user.id, user.email, user.name);
}

export async function loginUser(input: LoginInput): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const validPassword = await argon2.verify(user.passwordHash, input.password);
  if (!validPassword) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  return issueSession(user.id, user.email, user.name);
}

export async function changeUserPassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user || !(await argon2.verify(user.passwordHash, currentPassword))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect');
  }

  const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}

export async function issueSession(userId: string, email: string, name: string): Promise<AuthResult> {
  const accessToken = issueAccessToken({ id: userId, email, name });
  const refreshToken = generateRefreshToken();
  const familyId = randomUUID();
  const tokenHash = hashRefreshToken(refreshToken);

  await prisma.refreshToken.create({
    data: {
      userId,
      familyId,
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return {
    user: toPublicUser({ id: userId, email, name }),
    accessToken,
    refreshToken,
  };
}

export async function rotateRefreshToken(refreshToken: string) {
  const tokenHash = hashRefreshToken(refreshToken);
  const tokenRecord = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!tokenRecord) {
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid');
  }

  if (tokenRecord.revokedAt || tokenRecord.expiresAt < new Date()) {
    await revokeRefreshFamily(tokenRecord.familyId);
    throw new AppError(401, 'TOKEN_REUSED', 'Refresh token has been revoked');
  }

  const nextRefreshToken = generateRefreshToken();
  const nextTokenHash = hashRefreshToken(nextRefreshToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const rotation = await prisma.$transaction(async (tx) => {
    const consumed = await tx.refreshToken.updateMany({
      where: {
        id: tokenRecord.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { revokedAt: new Date() },
    });

    if (consumed.count !== 1) {
      await tx.refreshToken.updateMany({
        where: { familyId: tokenRecord.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return { status: 'reused' as const };
    }

    const user = await tx.user.findUnique({ where: { id: tokenRecord.userId } });
    if (!user) {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'User no longer exists');
    }

    await tx.refreshToken.create({
      data: {
        userId: user.id,
        familyId: tokenRecord.familyId,
        tokenHash: nextTokenHash,
        expiresAt,
      },
    });

    return { status: 'rotated' as const, user };
  });

  if (rotation.status === 'reused') {
    throw new AppError(401, 'TOKEN_REUSED', 'Refresh token has been revoked');
  }

  return {
    user: toPublicUser(rotation.user),
    accessToken: issueAccessToken({ id: rotation.user.id, email: rotation.user.email, name: rotation.user.name }),
    refreshToken: nextRefreshToken,
  };
}

export async function revokeRefreshFamily(familyId: string) {
  await prisma.refreshToken.updateMany({
    where: {
      familyId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

export async function revokeUserSessions(userId: string) {
  await prisma.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}
