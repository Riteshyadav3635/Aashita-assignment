'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Select } from '@/components/ui/select';
import type { TaskSearchResult } from '@/lib/types';

export default function WorkspaceSearchPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [term, setTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [status, setStatus] = useState('ALL');
  const [assignee, setAssignee] = useState('ALL');
  const [boardId, setBoardId] = useState('ALL');
  const [labelId, setLabelId] = useState('ALL');
  const [page, setPage] = useState(1);

  const { data: boardsData } = useQuery({ queryKey: ['workspace-boards-summary', workspaceId], queryFn: () => apiFetch<{ boards: Array<{ id: string; name: string }> }>(`/api/workspaces/${workspaceId}/boards`) });
  const { data: labelsData } = useQuery({ queryKey: ['workspace-labels', workspaceId], queryFn: () => apiFetch<{ labels: Array<{ id: string; name: string }> }>(`/api/workspaces/${workspaceId}/labels`) });
  const { data: membersData } = useQuery({ queryKey: ['workspace-members', workspaceId], queryFn: () => apiFetch<{ members: Array<{ userId: string; name: string; email: string }> }>(`/api/workspaces/${workspaceId}/members`) });

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedTerm(term.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [term]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedTerm) params.set('q', debouncedTerm);
    if (status !== 'ALL') params.set('status', status);
    if (assignee !== 'ALL') params.set('assigneeId', assignee);
    if (boardId !== 'ALL') params.set('boardId', boardId);
    if (labelId !== 'ALL') params.set('labelId', labelId);
    if (page > 1) params.set('page', String(page));
    const queryString = params.toString();
    window.history.replaceState(null, '', queryString ? `?${queryString}` : window.location.pathname);
  }, [assignee, boardId, debouncedTerm, labelId, page, status]);

  const query = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (debouncedTerm) query.set('q', debouncedTerm);
  if (status !== 'ALL') query.set('status', status);
  if (assignee !== 'ALL') query.set('assigneeId', assignee);
  if (boardId !== 'ALL') query.set('boardId', boardId);
  if (labelId !== 'ALL') query.set('labelId', labelId);

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['workspace-search', workspaceId, debouncedTerm, status, assignee, page],
    enabled: !!workspaceId,
    queryFn: () => apiFetch<{ items: TaskSearchResult[]; total: number; page: number; pageSize: number; totalPages: number }>(`/api/workspaces/${workspaceId}/search?${query.toString()}`),
  });

  const changeFilter = (change: () => void) => { change(); setPage(1); };

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h1 className="text-[20px] font-semibold text-[var(--color-text)]">Search tasks</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">Search task titles and descriptions across this workspace.</p>
      </header>
      <section className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input value={term} onChange={(event) => { setTerm(event.target.value); setPage(1); }} placeholder="Search tasks…" aria-label="Search tasks" className="h-9 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]" />
          <Select value={status} onChange={(event) => changeFilter(() => setStatus(event.target.value))} aria-label="Filter by status"><option value="ALL">All statuses</option><option value="TODO">To do</option><option value="IN_PROGRESS">In progress</option><option value="DONE">Done</option></Select>
          <Select value={assignee} onChange={(event) => changeFilter(() => setAssignee(event.target.value))} aria-label="Filter by assignee"><option value="ALL">All assignees</option><option value="unassigned">Unassigned</option>{membersData?.members.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}</Select>
          <Select value={boardId} onChange={(event) => changeFilter(() => setBoardId(event.target.value))} aria-label="Filter by board"><option value="ALL">All boards</option>{boardsData?.boards.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}</Select>
          <Select value={labelId} onChange={(event) => changeFilter(() => setLabelId(event.target.value))} aria-label="Filter by label"><option value="ALL">All labels</option>{labelsData?.labels.map((label) => <option key={label.id} value={label.id}>{label.name}</option>)}</Select>
        </div>
      </section>

      <section aria-live="polite" className="space-y-3">
        <p className="text-sm text-[var(--color-muted)]">{data ? `${data.total} result${data.total === 1 ? '' : 's'}` : 'Search results'}{isFetching && !isLoading ? ' · Updating…' : ''}</p>
        {error ? <p role="alert" className="rounded-[6px] border border-rose-500/30 p-3 text-sm text-rose-600">{error instanceof Error ? error.message : 'Search failed.'}</p> : null}
        {isLoading ? <p className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-sm text-[var(--color-muted)]">Searching…</p> : null}
        {data && data.items.length === 0 ? <p className="rounded-[8px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-sm text-[var(--color-muted)]">No matching tasks found.</p> : null}
        {data?.items.map((task) => <Link key={task.id} href={`/w/${workspaceId}/boards/${task.boardId}?task=${task.id}`} className="block rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-accent)]">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium text-[var(--color-text)]">{task.title}</p>{task.description ? <p className="mt-1 text-sm text-[var(--color-muted)]">{task.description}</p> : null}</div><span className="rounded-full border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-muted)]">{task.status.replace('_', ' ')}</span></div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--color-muted)]">{task.list ? <span>{task.list.name}</span> : null}<span>·</span><span>{task.assignee ? `Assigned to ${task.assignee.name}` : 'Unassigned'}</span>{task.labels?.map((label) => <span key={label.label.id} className="rounded-full border px-2 py-0.5" style={{ borderColor: `${label.label.color}88` }}>{label.label.name}</span>)}</div>
        </Link>)}
      </section>

      {data && data.totalPages > 1 ? <nav aria-label="Search result pages" className="flex items-center justify-between rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-[6px] border border-[var(--color-border)] px-3 py-2 text-sm disabled:opacity-40">Previous</button><span className="text-sm text-[var(--color-muted)]">Page {page} of {data.totalPages}</span><button type="button" disabled={page >= data.totalPages} onClick={() => setPage((value) => Math.min(data.totalPages, value + 1))} className="rounded-[6px] border border-[var(--color-border)] px-3 py-2 text-sm disabled:opacity-40">Next</button></nav> : null}
    </div>
  );
}
