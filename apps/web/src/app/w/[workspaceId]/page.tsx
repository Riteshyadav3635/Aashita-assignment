'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';
import type { Board, DashboardSummary, Workspace } from '@/lib/types';

function formatRelativeWhen(value: string) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / 60000));

  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffMinutes < 1440) return `${Math.round(diffMinutes / 60)}h ago`;
  return `${Math.round(diffMinutes / 1440)}d ago`;
}

export default function WorkspacePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const queryClient = useQueryClient();
  const [boardName, setBoardName] = useState('');
  const [isCreatingBoard, setIsCreatingBoard] = useState(false);

  useEffect(() => {
    document.title = 'Dashboard · Workspace';
  }, []);

  const { data: workspaceData } = useQuery({
    queryKey: ['workspace-summary', workspaceId],
    queryFn: () => apiFetch<{ workspace: Workspace }>(`/api/workspaces/${workspaceId}`),
  });

  const { data: boardsData } = useQuery({
    queryKey: ['workspace-boards-summary', workspaceId],
    queryFn: () => apiFetch<{ boards: Board[] }>(`/api/workspaces/${workspaceId}/boards`),
  });

  const { data: dashboardData } = useQuery({
    queryKey: ['workspace-dashboard', workspaceId],
    queryFn: () => apiFetch<DashboardSummary>(`/api/workspaces/${workspaceId}/dashboard`),
  });

  const workspace = workspaceData?.workspace;
  const boards = boardsData?.boards ?? [];
  const dashboard = dashboardData ?? null;

  const handleCreateBoard = async () => {
    const nextName = boardName.trim();
    if (!nextName) return;

    setIsCreatingBoard(true);
    try {
      await apiFetch(`/api/workspaces/${workspaceId}/boards`, {
        method: 'POST',
        body: JSON.stringify({ name: nextName }),
      });
      setBoardName('');
      await queryClient.invalidateQueries({ queryKey: ['workspace-boards-summary', workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ['workspace-boards', workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ['workspace-dashboard', workspaceId] });
    } finally {
      setIsCreatingBoard(false);
    }
  };

  const summaryText = `${dashboard?.totalBoards ?? boards.length} boards · ${dashboard?.totalTasks ?? 0} tasks · ${dashboard?.totalMembers ?? 0} members`;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 md:p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-[20px] font-semibold text-[var(--color-text)]">Dashboard</h1>
            <p className="mt-1 text-sm text-[var(--color-muted)]">{workspace?.name ?? 'Workspace'} overview</p>
          </div>
          <div className="text-sm text-[var(--color-muted)]">{summaryText}</div>
        </div>
      </header>

      <div className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--color-muted)]">
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-todo)]" />
            To do {dashboard?.byStatus.TODO ?? 0}
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-in-progress)]" />
            In progress {dashboard?.byStatus.IN_PROGRESS ?? 0}
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--color-done)]" />
            Done {dashboard?.byStatus.DONE ?? 0}
          </span>
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium tracking-normal text-[var(--color-muted)]">Tasks by status</h2>
            <span className="text-sm text-[var(--color-muted)]">{dashboard?.totalTasks ?? 0} total</span>
          </div>

          {dashboard && dashboard.totalTasks === 0 ? (
            <div className="rounded-[6px] border border-dashed border-[var(--color-border)] bg-[var(--color-subtle)] px-3 py-4 text-sm text-[var(--color-muted)]">
              No task activity yet.
            </div>
          ) : (
            <div className="space-y-4">
              {(['TODO', 'IN_PROGRESS', 'DONE'] as const).map((status) => {
                const count = dashboard?.byStatus[status] ?? 0;
                const width = dashboard && dashboard.totalTasks > 0 ? (count / dashboard.totalTasks) * 100 : 0;
                return (
                  <div key={status} className="grid grid-cols-[110px_1fr_36px] items-center gap-3">
                    <div className="flex items-center gap-2 text-sm text-[var(--color-text)]">
                      <span className={`h-2.5 w-2.5 rounded-full ${status === 'TODO' ? 'bg-[var(--color-todo)]' : status === 'IN_PROGRESS' ? 'bg-[var(--color-in-progress)]' : 'bg-[var(--color-done)]'}`} />
                      <span>{status === 'IN_PROGRESS' ? 'In progress' : status === 'DONE' ? 'Done' : 'To do'}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-subtle)]">
                      <div
                        className={`h-full rounded-full ${status === 'TODO' ? 'bg-[var(--color-todo)]' : status === 'IN_PROGRESS' ? 'bg-[var(--color-in-progress)]' : 'bg-[var(--color-done)]'}`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <span className="text-right text-sm tabular-nums text-[var(--color-muted)]">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-4 rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <div className="border-b border-[var(--color-border)] pb-3">
            <h2 className="text-sm font-medium text-[var(--color-muted)]">Overdue</h2>
            <p className="mt-2 text-[20px] font-semibold tabular-nums text-[var(--color-text)]">{dashboard?.overdueCount ?? 0}</p>
          </div>
          <div>
            <h2 className="text-sm font-medium text-[var(--color-muted)]">Activity (7 days)</h2>
            <p className="mt-2 text-[20px] font-semibold tabular-nums text-[var(--color-text)]">{dashboard?.activityCount7d ?? 0}</p>
          </div>
        </div>
      </section>

      {dashboard?.tasksByList?.length ? <section className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="mb-4 text-sm font-medium text-[var(--color-muted)]">Tasks by list</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{dashboard.tasksByList.map((entry) => <div key={entry.listId} className="rounded-[6px] border border-[var(--color-border)] bg-[var(--color-subtle)] p-3"><div className="flex items-center justify-between gap-2"><div><p className="text-sm font-medium text-[var(--color-text)]">{entry.listName}</p><p className="mt-1 text-xs text-[var(--color-muted)]">{entry.boardName}</p></div><span className="text-lg font-semibold tabular-nums text-[var(--color-text)]">{entry.count}</span></div></div>)}</div>
      </section> : null}

      <section className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-sm font-medium text-[var(--color-muted)]">Boards</h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={boardName}
              onChange={(event) => setBoardName(event.target.value)}
              placeholder="New board name"
              aria-label="Board name"
              className="w-full sm:w-[220px]"
            />
            <Button type="button" onClick={() => { void handleCreateBoard(); }} disabled={isCreatingBoard || !boardName.trim()}>
              <Plus size={14} strokeWidth={1.75} />
              {isCreatingBoard ? 'Creating…' : 'Create board'}
            </Button>
          </div>
        </div>

        {boards.length === 0 ? (
          <EmptyState
            title="Create your first board"
            description="Start a clean board for your next sprint or shared task list."
            actionLabel="Create board"
            onAction={() => {
              if (!boardName.trim()) {
                setBoardName('New board');
                return;
              }
              void handleCreateBoard();
            }}
            icon={<Plus size={16} strokeWidth={1.5} />}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {boards.map((board) => (
              <Link
                key={board.id}
                href={`/w/${workspaceId}/boards/${board.id}`}
                className="rounded-[6px] border border-[var(--color-border)] bg-[var(--color-subtle)] p-3 transition-colors duration-120 ease-out hover:border-[var(--color-accent)] hover:bg-[var(--color-surface)]"
              >
                <p className="text-sm font-medium text-[var(--color-text)]">{board.name}</p>
                {board.description ? <p className="mt-2 text-xs text-[var(--color-muted)]">{board.description}</p> : null}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="text-sm font-medium text-[var(--color-muted)]">Recent activity</h2>
        <div className="mt-4 space-y-3">
          {dashboard?.recentActivity.length ? (
            dashboard.recentActivity.slice(0, 5).map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-3 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-subtle)] px-3 py-2">
                <div>
                  <p className="text-sm text-[var(--color-text)]">{entry.action}</p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {entry.actor?.name ?? 'System'} · {formatRelativeWhen(entry.createdAt)}
                  </p>
                </div>
                <span className="text-[11px] text-[var(--color-muted)]">{entry.entityType}</span>
              </div>
            ))
          ) : (
            <div className="rounded-[6px] border border-dashed border-[var(--color-border)] bg-[var(--color-subtle)] px-3 py-4 text-sm text-[var(--color-muted)]">
              No recent activity.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
