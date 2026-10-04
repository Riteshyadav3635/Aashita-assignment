'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { Workspace } from '@/lib/types';

export default function HomePage() {
  const router = useRouter();
  const { user, memberships, loading, refreshSession } = useAuth();
  const [workspaceName, setWorkspaceName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    document.title = 'Workspace';
  }, []);

  useEffect(() => {
    if (!loading && user && memberships.length > 0) {
      router.replace(`/w/${memberships[0].workspaceId}`);
    }
  }, [loading, memberships, router, user]);

  const handleCreateWorkspace = async () => {
    const name = workspaceName.trim();
    if (!name) return;

    setIsCreating(true);
    try {
      const result = await apiFetch<{ workspace: Workspace }>('/api/workspaces', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      await refreshSession();
      router.push(`/w/${result.workspace.id}`);
    } finally {
      setIsCreating(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
        <div className="text-sm text-[var(--color-muted)]">Loading workspace…</div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
        <div className="w-full max-w-[480px] rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-8">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[6px] border border-[var(--color-border)] bg-[var(--color-subtle)] text-[var(--color-accent)]">
              <span className="text-sm font-semibold">W</span>
            </div>
            <p className="text-sm text-[var(--color-muted)]">Workspace</p>
          </div>

          <h1 className="text-[24px] font-semibold text-[var(--color-text)]">Work with your team in one place</h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Track boards, tasks, and activity without the noise.
          </p>

          <div className="mt-6 flex items-center gap-2">
            <Button type="button" onClick={() => router.push('/login')}>Log in</Button>
            <Button type="button" variant="secondary" onClick={() => router.push('/signup')}>Create account</Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-[560px] rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-[var(--color-muted)]">Workspace</p>
            <h1 className="mt-1 text-[20px] font-semibold text-[var(--color-text)]">{user.name}</h1>
          </div>
          <Button variant="ghost" onClick={() => router.push('/login')}>Switch</Button>
        </div>

        <div className="space-y-3">
          {memberships.length === 0 ? (
            <div className="rounded-[8px] border border-dashed border-[var(--color-border)] bg-[var(--color-subtle)] p-4">
              <p className="text-sm text-[var(--color-text)]">No workspace memberships yet.</p>
              <div className="mt-3 flex gap-2">
                <Input
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  placeholder="Workspace name"
                  aria-label="Workspace name"
                  className="flex-1"
                />
                <Button type="button" onClick={() => { void handleCreateWorkspace(); }} disabled={isCreating || !workspaceName.trim()}>
                  {isCreating ? 'Creating…' : 'Create'}
                </Button>
              </div>
            </div>
          ) : (
            memberships.map((workspace) => (
              <Link
                key={workspace.workspaceId}
                href={`/w/${workspace.workspaceId}`}
                className="flex items-center justify-between rounded-[6px] border border-[var(--color-border)] bg-[var(--color-subtle)] p-3 text-left transition-colors duration-120 ease-out hover:border-[var(--color-accent)]"
              >
                <span className="text-sm font-medium text-[var(--color-text)]">{workspace.name}</span>
                <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-muted)]">
                  {workspace.role}
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
