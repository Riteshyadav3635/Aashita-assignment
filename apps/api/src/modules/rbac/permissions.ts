export const roles = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as const;
export type Role = (typeof roles)[number];

export const actions = [
  'workspace.read',
  'workspace.update',
  'workspace.delete',
  'member.list',
  'member.invite',
  'member.remove',
  'member.changeRole',
  'board.write',
  'board.delete',
  'list.write',
  'task.write',
  'label.write',
  'digest.trigger',
] as const;

export type Action = (typeof actions)[number];

const ROLE_ACTIONS: Record<Role, Action[]> = {
  OWNER: [
    'workspace.read',
    'workspace.update',
    'workspace.delete',
    'member.list',
    'member.invite',
    'member.remove',
    'member.changeRole',
    'board.write',
    'board.delete',
    'list.write',
    'task.write',
    'label.write',
    'digest.trigger',
  ],
  ADMIN: [
    'workspace.read',
    'workspace.update',
    'member.list',
    'member.invite',
    'member.remove',
    'member.changeRole',
    'board.write',
    'board.delete',
    'list.write',
    'task.write',
    'label.write',
    'digest.trigger',
  ],
  MEMBER: [
    'workspace.read',
    'member.list',
    'board.write',
    'board.delete',
    'list.write',
    'task.write',
    'label.write',
  ],
  VIEWER: ['workspace.read', 'member.list'],
};

export function can(role: Role, action: Action): boolean {
  return ROLE_ACTIONS[role].includes(action);
}

export function canInviteRole(actorRole: Role, targetRole: Role): boolean {
  if (targetRole === 'OWNER') return false;
  if (actorRole === 'OWNER') return true;
  if (actorRole === 'ADMIN') return targetRole === 'MEMBER' || targetRole === 'VIEWER';
  return false;
}

export function canRemoveMember(actorRole: Role, targetRole: Role, isSelf: boolean): boolean {
  if (actorRole === 'OWNER') {
    if (isSelf) return false;
    return targetRole !== 'OWNER';
  }

  if (actorRole === 'ADMIN') {
    if (isSelf) return true;
    return targetRole === 'MEMBER' || targetRole === 'VIEWER';
  }

  return isSelf;
}

export function canChangeRole(actorRole: Role, targetCurrentRole: Role, newRole: Role): boolean {
  if (newRole === 'OWNER' || targetCurrentRole === 'OWNER') return false;

  if (actorRole === 'OWNER') return true;
  if (actorRole === 'ADMIN') {
    return newRole === 'MEMBER' || newRole === 'VIEWER';
  }
  return false;
}
