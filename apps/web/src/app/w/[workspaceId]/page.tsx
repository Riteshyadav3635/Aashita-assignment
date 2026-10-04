'use client';

import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Activity, ArrowUpRight, CheckCircle2, Circle, Clock3, FolderKanban, ListTodo, Plus, Sparkles, Users } from 'lucide-react';
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
    <div className="dashboard-page mx-auto w-full max-w-[1500px] space-y-7 p-4 sm:p-6 lg:p-9">
      <header className="dashboard-intro flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[var(--color-muted)]">
            <Sparkles size={13} className="text-[var(--color-accent)]" />
            Your team at a glance
          </div>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[var(--color-text)] sm:text-[34px]">Dashboard</h1>
          <p className="mt-1.5 text-sm text-[var(--color-muted)]">{workspace?.name ?? 'Workspace'} overview</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-sm text-[var(--color-muted)] shadow-sm">
          <FolderKanban size={15} className="text-[var(--color-accent)]" />
          {summaryText}
        </div>
      </header>

      <section aria-label="Workspace statistics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: 'Total tasks', value: dashboard?.totalTasks ?? 0, icon: ListTodo, accent: 'text-[var(--color-accent)]', note: 'Across all boards' },
          { label: 'Boards', value: dashboard?.totalBoards ?? boards.length, icon: FolderKanban, accent: 'text-sky-600 dark:text-sky-300', note: 'Project spaces' },
          { label: 'Members', value: dashboard?.totalMembers ?? 0, icon: Users, accent: 'text-violet-600 dark:text-violet-300', note: 'In this workspace' },
          { label: 'Overdue', value: dashboard?.overdueCount ?? 0, icon: Clock3, accent: 'text-amber-600 dark:text-amber-300', note: 'Needs attention' },
          { label: 'Activity · 7 days', value: dashboard?.activityCount7d ?? 0, icon: Activity, accent: 'text-emerald-600 dark:text-emerald-300', note: 'Recent updates' },
        ].map(({ label, value, icon: Icon, accent, note }) => (
          <article key={label} className="dashboard-card group rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-[var(--color-muted)]">{label}</p>
                <p className="mt-3 text-[30px] font-semibold leading-none tracking-[-0.04em] tabular-nums text-[var(--color-text)]">{value}</p>
              </div>
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-subtle)] ${accent}`}>
                <Icon size={18} strokeWidth={1.8} />
              </span>
            </div>
            <p className="mt-4 text-xs text-[var(--color-muted)]">{note}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.4fr_0.85fr]">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-6">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-[var(--color-text)]">Tasks by status</h2>
              <p className="mt-1 text-xs text-[var(--color-muted)]">Progress across your workspace</p>
            </div>
            <span className="rounded-full bg-[var(--color-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--color-muted)]">{dashboard?.totalTasks ?? 0} total</span>
          </div>

          {dashboard && dashboard.totalTasks === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-subtle)] px-4 py-6 text-sm text-[var(--color-muted)]">
              No task activity yet.
            </div>
          ) : (
            <div className="space-y-5">
              {(['TODO', 'IN_PROGRESS', 'DONE'] as const).map((status) => {
                const count = dashboard?.byStatus[status] ?? 0;
                const width = dashboard && dashboard.totalTasks > 0 ? (count / dashboard.totalTasks) * 100 : 0;
                const StatusIcon = status === 'TODO' ? Circle : status === 'IN_PROGRESS' ? Clock3 : CheckCircle2;
                return (
                  <div key={status} className="grid grid-cols-[minmax(105px,0.4fr)_1fr_36px] items-center gap-3 sm:grid-cols-[minmax(130px,0.4fr)_1fr_44px] sm:gap-4">
                    <div className="flex items-center gap-2.5 text-sm text-[var(--color-text)]">
                      <StatusIcon size={16} strokeWidth={1.8} className={status === 'TODO' ? 'text-[var(--color-todo)]' : status === 'IN_PROGRESS' ? 'text-[var(--color-in-progress)]' : 'text-[var(--color-done)]'} />
                      <span>{status === 'IN_PROGRESS' ? 'In progress' : status === 'DONE' ? 'Done' : 'To do'}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--color-subtle)]">
                      <div
                        className={`dashboard-progress h-full rounded-full ${status === 'TODO' ? 'bg-[var(--color-todo)]' : status === 'IN_PROGRESS' ? 'bg-[var(--color-in-progress)]' : 'bg-[var(--color-done)]'}`}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <span className="text-right text-sm font-semibold tabular-nums text-[var(--color-text)]">{count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-6">
          <div className="mb-5">
            <h2 className="text-base font-semibold tracking-tight text-[var(--color-text)]">At a glance</h2>
            <p className="mt-1 text-xs text-[var(--color-muted)]">A quick pulse on the work</p>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-subtle)]/60 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-300"><Clock3 size={17} /></span>
                <div><p className="text-sm font-medium text-[var(--color-text)]">Overdue tasks</p><p className="text-xs text-[var(--color-muted)]">Past due and not complete</p></div>
              </div>
              <span className="text-2xl font-semibold tabular-nums text-[var(--color-text)]">{dashboard?.overdueCount ?? 0}</span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-subtle)]/60 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"><Activity size={17} /></span>
                <div><p className="text-sm font-medium text-[var(--color-text)]">Recent activity</p><p className="text-xs text-[var(--color-muted)]">Updates in the last 7 days</p></div>
              </div>
              <span className="text-2xl font-semibold tabular-nums text-[var(--color-text)]">{dashboard?.activityCount7d ?? 0}</span>
            </div>
          </div>
        </div>
      </section>

      {dashboard?.tasksByList?.length ? <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold tracking-tight text-[var(--color-text)]">Tasks by list</h2>
          <p className="mt-1 text-xs text-[var(--color-muted)]">Distribution across your board columns</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{dashboard.tasksByList.map((entry) => <div key={entry.listId} className="dashboard-card rounded-xl border border-[var(--color-border)] bg-[var(--color-subtle)]/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--color-text)]">{entry.listName}</p><p className="mt-1 truncate text-xs text-[var(--color-muted)]">{entry.boardName}</p></div>
            <span className="flex h-9 min-w-9 items-center justify-center rounded-lg bg-[var(--color-surface)] px-2 text-sm font-semibold tabular-nums text-[var(--color-text)]">{entry.count}</span>
          </div>
        </div>)}</div>
      </section> : null}

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="text-base font-semibold tracking-tight text-[var(--color-text)]">Boards</h2><p className="mt-1 text-xs text-[var(--color-muted)]">Your team&apos;s project spaces</p></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={boardName}
              onChange={(event) => setBoardName(event.target.value)}
              placeholder="New board name"
              aria-label="Board name"
              className="h-10 w-full rounded-lg sm:w-[220px]"
            />
            <Button type="button" onClick={() => { void handleCreateBoard(); }} disabled={isCreatingBoard || !boardName.trim()} className="h-10 rounded-lg">
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
                className="dashboard-card group rounded-xl border border-[var(--color-border)] bg-[var(--color-subtle)]/60 p-4 transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-surface)] focus-visible:border-[var(--color-accent)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent)]/10 text-[var(--color-accent)]"><FolderKanban size={18} /></span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--color-text)]">{board.name}</p>
                      <p className="mt-1 text-xs text-[var(--color-muted)]">Open board</p>
                    </div>
                  </div>
                  <ArrowUpRight size={16} className="shrink-0 text-[var(--color-muted)] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--color-accent)]" />
                </div>
                {board.description ? <p className="mt-4 line-clamp-2 text-xs leading-5 text-[var(--color-muted)]">{board.description}</p> : null}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center justify-between">
          <div><h2 className="text-base font-semibold tracking-tight text-[var(--color-text)]">Recent activity</h2><p className="mt-1 text-xs text-[var(--color-muted)]">The latest updates from your workspace</p></div>
          <Activity size={18} className="text-[var(--color-accent)]" />
        </div>
        <div className="space-y-0">
          {dashboard?.recentActivity.length ? (
            dashboard.recentActivity.slice(0, 5).map((entry) => (
              <div key={entry.id} className="relative flex items-start gap-3 border-l border-[var(--color-border)] py-3 pl-5 first:pt-1 last:border-l-transparent last:pb-0">
                <span className="absolute -left-[9px] top-3 flex h-[17px] w-[17px] items-center justify-center rounded-full border-2 border-[var(--color-surface)] bg-[var(--color-accent)] text-white first:top-1">
                  <CheckCircle2 size={11} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[var(--color-text)]">{entry.action}</p>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    {entry.actor?.name ?? 'System'} · {formatRelativeWhen(entry.createdAt)}
                  </p>
                </div>
                <span className="rounded-full bg-[var(--color-subtle)] px-2.5 py-1 text-[10px] font-medium capitalize text-[var(--color-muted)]">{entry.entityType}</span>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-subtle)] px-4 py-5 text-sm text-[var(--color-muted)]">
              No recent activity.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
