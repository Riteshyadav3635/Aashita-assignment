'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Activity, ChevronDown, FolderKanban, LayoutGrid, LogOut, Menu, Plus, Search, Users, X } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';
import { useAuth, useRole } from '@/lib/auth-context';
import { createSocketConnection } from '@/lib/socket';
import type { Board, Workspace } from '@/lib/types';

const navItems = [
  { label: 'Dashboard', href: '/w/:workspaceId', icon: LayoutGrid },
  { label: 'Search', href: '/w/:workspaceId/search', icon: Search },
  { label: 'Activity', href: '/w/:workspaceId/activity', icon: Activity },
  { label: 'Members', href: '/w/:workspaceId/members', icon: Users },
];

export function WorkspaceShell({ workspaceId, children }: { workspaceId: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { memberships, user, getAccessToken, refreshSession, logout } = useAuth();
  const role = useRole(workspaceId);
  const queryClient = useQueryClient();
  const [showCreateWorkspace, setShowCreateWorkspace] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const token = getAccessToken();
    if (!token || !user) return;

    const socket = createSocketConnection();
    const refreshWorkspaceData = () => {
      void queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ['workspace-boards', workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ['workspace-summary', workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ['workspace-boards-summary', workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ['board-page', workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ['board-lists-page', workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ['workspace-activity', workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ['workspace-dashboard', workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ['workspace-members', workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ['workspace-invitations', workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ['workspace-labels', workspaceId] });
    };

    const events = [
      'workspace:created',
      'member:invited',
      'member:joined',
      'member:removed',
      'member:role_changed',
      'board:created',
      'board:updated',
      'board:deleted',
      'list:created',
      'list:updated',
      'list:moved',
      'list:deleted',
      'task:created',
      'task:updated',
      'task:moved',
      'task:deleted',
      'invitation:revoked',
      'label:created',
      'label:updated',
      'label:deleted',
    ] as const;

    socket.on('connect', () => {
      socket.emit('workspace:join', { workspaceId }, (response: { ok?: boolean; workspaceId?: string; code?: string }) => {
        if (!response.ok) {
          console.warn('Workspace socket join failed:', response.code ?? 'unknown');
        }
      });
    });

    for (const eventName of events) {
      socket.on(eventName, refreshWorkspaceData);
    }

    const handleMemberRemoved = (event: { userId?: string }) => {
      refreshWorkspaceData();
      if (event.userId === user.id) {
        void refreshSession().then(() => {
          window.alert('Your access to this workspace was removed.');
          router.replace('/');
        });
      }
    };
    const handleRoleChanged = (event: { userId?: string }) => {
      refreshWorkspaceData();
      if (event.userId === user.id) {
        void refreshSession().then(() => window.alert('Your workspace role has changed.'));
      }
    };
    socket.off('member:removed', refreshWorkspaceData);
    socket.on('member:removed', handleMemberRemoved);
    socket.off('member:role_changed', refreshWorkspaceData);
    socket.on('member:role_changed', handleRoleChanged);

    socket.connect();

    return () => {
      for (const eventName of events) {
        socket.off(eventName, refreshWorkspaceData);
      }
      socket.off('member:removed', handleMemberRemoved);
      socket.off('member:role_changed', handleRoleChanged);
      socket.disconnect();
    };
  }, [getAccessToken, queryClient, refreshSession, router, user, workspaceId]);

  const handleCreateWorkspace = async () => {
    const name = newWorkspaceName.trim();
    if (!name) return;

    setIsCreatingWorkspace(true);
    try {
      const result = await apiFetch<{ workspace: Workspace }>('/api/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });

      setNewWorkspaceName('');
      setShowCreateWorkspace(false);
      await refreshSession();
      await queryClient.invalidateQueries({ queryKey: ['workspace'] });
      router.push(`/w/${result.workspace.id}`);
    } finally {
      setIsCreatingWorkspace(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    router.push('/login');
  };

  const handleCreateBoard = async () => {
    if (role === 'VIEWER') return;
    const name = window.prompt('Name for the new board:')?.trim();
    if (!name) return;
    try {
      const result = await apiFetch<{ board: Board }>(`/api/workspaces/${workspaceId}/boards`, {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      await queryClient.invalidateQueries({ queryKey: ['workspace-boards', workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ['workspace-dashboard', workspaceId] });
      router.push(`/w/${workspaceId}/boards/${result.board.id}`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'The board could not be created.');
    }
  };

  const { data: workspaceData } = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => apiFetch<{ workspace: Workspace }>(`/api/workspaces/${workspaceId}`),
  });

  const { data: boardData } = useQuery({
    queryKey: ['workspace-boards', workspaceId],
    queryFn: () => apiFetch<{ boards: Board[] }>(`/api/workspaces/${workspaceId}/boards`),
  });

  const workspaceName = workspaceData?.workspace?.name ?? 'Workspace';
  const boards = boardData?.boards ?? [];

  const sidebar = (
    <aside className={`workspace-sidebar relative flex w-full max-w-[256px] flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] p-4 ${showCreateWorkspace ? 'md:w-[256px]' : 'md:w-[76px]'} md:max-w-none md:p-3 lg:w-[256px] lg:p-4`}>
      <div className="mb-6 flex items-center justify-between gap-3 border-b border-[var(--color-border)] pb-4 md:justify-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
            <FolderKanban size={17} strokeWidth={1.75} />
          </div>
          <div className="min-w-0 md:hidden lg:block">
            <div className="text-[11px] font-medium text-[var(--color-muted)]">Workspace</div>
            <div className="mt-0.5 max-w-[150px] truncate text-sm font-semibold text-[var(--color-text)]">{workspaceName}</div>
          </div>
        </div>
        <Button type="button" variant="ghost" size="sm" aria-label="Close sidebar" className="h-8 w-8 p-0 md:hidden" onClick={() => setMobileOpen(false)}>
          <X size={14} strokeWidth={1.75} />
        </Button>
      </div>

      <div className="mb-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-subtle)]/70 p-2.5">
        <div className="mb-2 flex items-center justify-between gap-2 md:justify-center lg:justify-between">
          <span className="text-[11px] font-medium text-[var(--color-muted)] md:hidden lg:inline">Workspaces</span>
          <Button type="button" variant="secondary" size="sm" aria-label="Create workspace" title="Create workspace" onClick={() => setShowCreateWorkspace(true)} className="gap-1.5 px-2 text-[11px] md:h-8 md:w-8 md:p-0 lg:h-8 lg:w-auto lg:px-2">
            <Plus size={12} strokeWidth={1.75} />
            <span className="md:hidden lg:inline">New</span>
          </Button>
        </div>

        <div className="space-y-1.5">
          {memberships.map((membership) => {
            const active = membership.workspaceId === workspaceId;
            return (
              <Link
                key={membership.workspaceId}
                href={`/w/${membership.workspaceId}`}
                className={[
                  'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors duration-150 ease-out md:justify-center md:px-0 lg:justify-start lg:px-2.5',
                  active
                    ? 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm'
                    : 'border-transparent bg-transparent text-[var(--color-muted)] hover:border-[var(--color-border)] hover:bg-[var(--color-subtle)] hover:text-[var(--color-text)]',
                ].join(' ')}
                title={membership.name}
              >
                <Avatar name={membership.name} size="sm" className="shrink-0" />
                <span className="truncate md:hidden lg:inline">{membership.name}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {showCreateWorkspace ? (
        <div className="mb-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-subtle)] p-3">
          <div className="mb-2 text-[11px] font-medium text-[var(--color-muted)]">Create workspace</div>
          <Input
            value={newWorkspaceName}
            onChange={(event) => setNewWorkspaceName(event.target.value)}
            placeholder="Workspace name"
            aria-label="Workspace name"
            className="mb-3"
          />
          <div className="flex items-center gap-2">
            <Button type="button" onClick={() => { void handleCreateWorkspace(); }} disabled={isCreatingWorkspace || !newWorkspaceName.trim()} className="flex-1">
              {isCreatingWorkspace ? 'Creating…' : 'Create'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setShowCreateWorkspace(false);
                setNewWorkspaceName('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between gap-2 md:justify-center lg:justify-between">
          <span className="text-[11px] font-medium text-[var(--color-muted)] md:hidden lg:inline">Boards</span>
          {role !== 'VIEWER' ? <Button type="button" variant="ghost" size="sm" aria-label="Add board" title="Add board" className="h-7 w-7 p-0" onClick={() => { void handleCreateBoard(); }}>
            <Plus size={14} strokeWidth={1.75} />
          </Button> : null}
        </div>

        <div className="space-y-1.5">
          {boards.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-subtle)] px-2.5 py-2 text-sm text-[var(--color-muted)] md:hidden lg:block">
              No boards yet.
            </div>
          ) : (
            boards.map((board) => (
              <Link
                key={board.id}
                href={`/w/${workspaceId}/boards/${board.id}`}
                className={[
                  'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors duration-150 ease-out md:justify-center md:px-0 lg:justify-start lg:px-2.5',
                  pathname === `/w/${workspaceId}/boards/${board.id}`
                    ? 'border-[var(--color-border)] bg-[var(--color-subtle)] text-[var(--color-text)] shadow-sm'
                    : 'border-transparent text-[var(--color-muted)] hover:border-[var(--color-border)] hover:bg-[var(--color-subtle)] hover:text-[var(--color-text)]',
                ].join(' ')}
                title={board.name}
              >
                <FolderKanban size={14} strokeWidth={1.75} className="shrink-0" />
                <span className="truncate md:hidden lg:inline">{board.name}</span>
              </Link>
            ))
          )}
        </div>
      </div>

      <nav aria-label="Workspace navigation" className="space-y-1.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const href = item.href.replace(':workspaceId', workspaceId);
          const active = pathname === href;
          return (
            <Link
              key={item.href}
              href={href}
              className={[
              'flex items-center gap-2 rounded-lg px-2.5 py-2.5 text-sm transition-colors duration-150 ease-out md:justify-center md:px-0 lg:justify-start lg:px-3',
                active
                ? 'bg-[var(--color-accent)]/10 font-medium text-[var(--color-accent)]'
                  : 'text-[var(--color-muted)] hover:bg-[var(--color-subtle)] hover:text-[var(--color-text)]',
              ].join(' ')}
              aria-current={active ? 'page' : undefined}
              title={item.label}
            >
              <Icon size={16} strokeWidth={1.75} className="shrink-0" />
              <span className="md:hidden lg:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-[var(--color-border)] pt-4">
        <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-subtle)]/70 p-2 md:justify-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <Avatar name={user?.name ?? 'User'} size="sm" />
            <div className="min-w-0 md:hidden lg:block">
              <div className="truncate text-sm font-medium text-[var(--color-text)]">{user?.name ?? 'User'}</div>
              <div className="text-[11px] text-[var(--color-muted)]">{role ?? 'Member'}</div>
            </div>
          </div>
          <Button type="button" variant="ghost" size="sm" aria-label="Sign out" title="Sign out" className="h-8 w-8 shrink-0 p-0" onClick={() => { void handleSignOut(); }}>
            <LogOut size={14} strokeWidth={1.75} />
          </Button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)]">
      <div className="flex min-h-screen">
        <div className={`hidden md:flex md:shrink-0 ${showCreateWorkspace ? 'md:w-[256px]' : 'md:w-[76px]'} lg:w-[256px]`}>{sidebar}</div>

        {mobileOpen ? (
          <div className="fixed inset-0 z-40 bg-[color:rgba(12,10,9,0.28)] md:hidden" onClick={() => setMobileOpen(false)}>
            <div className="h-full w-[240px] bg-[var(--color-surface)]" onClick={(event) => event.stopPropagation()}>
              {sidebar}
            </div>
          </div>
        ) : null}

        <main className="flex-1 bg-[var(--color-bg)]">
          <header className="flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 md:hidden">
            <Button type="button" variant="ghost" size="sm" aria-label="Open workspace navigation" className="h-8 w-8 p-0" onClick={() => setMobileOpen(true)}>
              <Menu size={16} strokeWidth={1.75} />
            </Button>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-[6px] bg-[var(--color-subtle)] text-[var(--color-accent)]">
                <FolderKanban size={13} strokeWidth={1.75} />
              </div>
              <span className="text-sm font-medium">{workspaceName}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Open board menu">
                <ChevronDown size={14} strokeWidth={1.75} />
              </Button>
            </div>
          </header>

          <div className="min-h-screen">{children}</div>
        </main>
      </div>
    </div>
  );
}
