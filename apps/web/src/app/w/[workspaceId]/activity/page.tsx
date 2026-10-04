'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import type { ActivityEntry } from '@/lib/types';
import { Select } from '@/components/ui/select';

function formatWhen(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export default function WorkspaceActivityPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [action, setAction] = useState('');
  const [filter, setFilter] = useState('');
  const [actorId, setActorId] = useState('');
  const { data: membersData } = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => apiFetch<{ members: Array<{ userId: string; name: string }> }>(`/api/workspaces/${workspaceId}/members`),
  });
  useEffect(() => {
    const timer = window.setTimeout(() => setFilter(action.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [action]);

  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['workspace-activity', workspaceId, filter, actorId],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '20' });
      if (pageParam) params.set('cursor', pageParam);
      if (filter) params.set('action', filter);
      if (actorId) params.set('actorId', actorId);
      return apiFetch<{ items: ActivityEntry[]; hasMore: boolean; nextCursor: string | null }>(`/api/workspaces/${workspaceId}/activity?${params}`);
    },
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined,
  });

  const items = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-8">
      <p className="text-sm uppercase tracking-[0.3em] text-sky-400">Activity</p>
      <h1 className="mt-3 text-2xl font-semibold text-white">Recent workspace activity</h1>
      <div className="mt-5 grid gap-3 sm:grid-cols-2"><input value={action} onChange={(event) => setAction(event.target.value)} placeholder="Filter actions…" aria-label="Filter activity actions" className="h-9 rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-sky-500" /><Select value={actorId} onChange={(event) => setActorId(event.target.value)} aria-label="Filter by member"><option value="">All members</option>{membersData?.members.map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}</Select></div>

      {isLoading ? (
        <div className="mt-6 text-slate-400">Loading activity…</div>
      ) : items.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-700 p-4 text-slate-400">No activity yet.</div>
      ) : (
        <div className="mt-6 space-y-3">
          {items.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-white">{entry.action}</p>
                  <p className="text-sm text-slate-400">
                    {entry.actor?.name ?? 'System'} · {entry.entityType}
                  </p>
                </div>
                <span className="text-xs text-slate-400">{formatWhen(entry.createdAt)}</span>
              </div>
              {entry.metadata && Object.keys(entry.metadata).length > 0 ? (
                <pre className="mt-3 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-300">
                  {JSON.stringify(entry.metadata, null, 2)}
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {hasNextPage ? <button type="button" onClick={() => { void fetchNextPage(); }} disabled={isFetchingNextPage} className="mt-5 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 disabled:opacity-50">{isFetchingNextPage ? 'Loading…' : 'Load more'}</button> : null}
    </div>
  );
}
