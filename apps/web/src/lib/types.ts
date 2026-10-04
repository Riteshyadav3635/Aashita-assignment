export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface WorkspaceSummary {
  workspaceId: string;
  role: Role;
  name: string;
}

export interface Workspace {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Board {
  id: string;
  name: string;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface List {
  id: string;
  workspaceId: string;
  boardId: string;
  name: string;
  position?: string;
  createdAt?: string;
  updatedAt?: string;
  tasks?: Task[];
}

export interface Task {
  id: string;
  workspaceId: string;
  boardId: string;
  listId: string;
  title: string;
  description?: string | null;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
  position?: string;
  assigneeId?: string | null;
  createdById?: string;
  dueDate?: string | null;
  version?: number;
  labels?: Array<{ label: { id: string; name: string; color: string } }>;
  createdAt?: string;
  updatedAt?: string;
}

export interface Member {
  workspaceId: string;
  userId: string;
  role: Role;
  email: string;
  name: string;
  createdAt?: string;
}

export interface Invitation {
  id: string;
  email: string;
  role: Exclude<Role, 'OWNER'>;
  expiresAt: string;
  acceptedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
}

export interface DashboardSummary {
  workspaceId: string;
  totalBoards: number;
  totalMembers: number;
  totalTasks: number;
  byStatus: {
    TODO: number;
    IN_PROGRESS: number;
    DONE: number;
  };
  tasksByList?: Array<{ listId: string; listName: string; boardName: string; count: number }>;
  overdueCount: number;
  activityCount7d?: number;
  topAssignees: Array<{
    userId: string;
    count: number;
  }>;
  recentActivity: ActivityEntry[];
  generatedAt: string;
}

export interface ActivityEntry {
  id: string;
  workspaceId: string;
  actorId?: string | null;
  actor?: {
    id: string;
    name: string;
    email: string;
  } | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface TaskSearchResult {
  id: string;
  boardId: string;
  workspaceId?: string;
  title: string;
  description?: string | null;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
  createdAt?: string;
  updatedAt?: string;
  assignee?: {
    id: string;
    name: string;
    email: string;
  } | null;
  list?: {
    id: string;
    name: string;
  } | null;
  labels?: Array<{
    label: {
      id: string;
      name: string;
      color: string;
    };
  }>;
}
