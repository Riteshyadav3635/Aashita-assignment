'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ApiError, apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { Invitation, Member, Role } from '@/lib/types';

const roleToBadge: Record<Role, 'default' | 'success' | 'warning' | 'neutral'> = {
  OWNER: 'success', ADMIN: 'warning', MEMBER: 'default', VIEWER: 'neutral',
};

export default function WorkspaceMembersPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const queryClient = useQueryClient();
  const { user, roleForWorkspace } = useAuth();
  const actorRole = roleForWorkspace(workspaceId);
  const canInvite = actorRole === 'OWNER' || actorRole === 'ADMIN';
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'MEMBER' | 'VIEWER'>('MEMBER');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { document.title = 'Members · Workspace'; }, []);

  const membersQuery = useQuery({
    queryKey: ['workspace-members', workspaceId],
    queryFn: () => apiFetch<{ members: Member[] }>(`/api/workspaces/${workspaceId}/members`),
  });
  const invitesQuery = useQuery({
    queryKey: ['workspace-invitations', workspaceId],
    queryFn: () => apiFetch<{ invitations: Invitation[] }>(`/api/workspaces/${workspaceId}/invitations`),
  });
  const members = membersQuery.data?.members ?? [];
  const invitations = (invitesQuery.data?.invitations ?? []).filter((invite) => !invite.acceptedAt && !invite.revokedAt);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['workspace-members', workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ['workspace-invitations', workspaceId] }),
      queryClient.invalidateQueries({ queryKey: ['workspace-dashboard', workspaceId] }),
    ]);
  };

  const act = async (key: string, operation: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try { await operation(); await refresh(); }
    catch (cause) { setError(cause instanceof ApiError ? `${cause.message} (${cause.status})` : cause instanceof Error ? cause.message : 'The change could not be saved.'); }
    finally { setBusy(null); }
  };

  const handleInvite = async () => {
    if (!email.trim()) return;
    await act('invite', async () => {
      await apiFetch(`/api/workspaces/${workspaceId}/invitations`, { method: 'POST', body: JSON.stringify({ email: email.trim(), role }) });
      setEmail('');
    });
  };

  const canChange = (member: Member) => member.role !== 'OWNER' && member.userId !== user?.id && (actorRole === 'OWNER' || (actorRole === 'ADMIN' && (member.role === 'MEMBER' || member.role === 'VIEWER')));
  const canRemove = (member: Member) => member.userId === user?.id
    ? actorRole === 'ADMIN'
    : actorRole === 'OWNER' ? member.role !== 'OWNER' : actorRole === 'ADMIN' && (member.role === 'MEMBER' || member.role === 'VIEWER');
  const allowedInviteRoles = actorRole === 'OWNER' ? ['ADMIN', 'MEMBER', 'VIEWER'] as const : ['MEMBER', 'VIEWER'] as const;

  return (
    <div className="space-y-5 p-4 md:p-6">
      <header className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h1 className="text-[20px] font-semibold text-[var(--color-text)]">Members</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">Manage workspace access and pending invitations.</p>
      </header>

      {error ? <div role="alert" className="rounded-[6px] border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-600">{error}</div> : null}

      {canInvite ? <section className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 text-sm font-medium text-[var(--color-text)]">Invite someone</h2>
        <div className="flex flex-col gap-3 md:flex-row">
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="member@example.com" aria-label="Email address" className="flex-1" />
          <Select value={role} onChange={(event) => setRole(event.target.value as typeof role)} aria-label="Invite role" className="md:w-[170px]">
            {allowedInviteRoles.map((allowed) => <option key={allowed} value={allowed}>{allowed[0] + allowed.slice(1).toLowerCase()}</option>)}
          </Select>
          <Button type="button" onClick={() => { void handleInvite(); }} disabled={busy !== null || !email.trim()}>{busy === 'invite' ? 'Sending…' : 'Send invite'}</Button>
        </div>
      </section> : null}

      <section className="overflow-hidden rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="border-b border-[var(--color-border)] px-4 py-3"><h2 className="text-sm font-medium text-[var(--color-text)]">Workspace members</h2></div>
        {membersQuery.isLoading ? <p className="p-5 text-sm text-[var(--color-muted)]">Loading members…</p> : members.length === 0 ? <p className="p-5 text-sm text-[var(--color-muted)]">No members yet.</p> : (
          <div className="overflow-x-auto"><table className="min-w-full text-left">
            <thead className="bg-[var(--color-subtle)] text-[var(--color-muted)]"><tr><th className="px-4 py-3 text-xs font-medium">Member</th><th className="px-4 py-3 text-xs font-medium">Role</th><th className="px-4 py-3 text-xs font-medium">Joined</th><th className="px-4 py-3 text-right text-xs font-medium">Actions</th></tr></thead>
            <tbody>{members.map((member) => <tr key={member.userId} className="border-t border-[var(--color-border)]">
              <td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar name={member.name} size="sm" /><div><p className="text-sm font-medium text-[var(--color-text)]">{member.name}{member.userId === user?.id ? ' (you)' : ''}</p><p className="text-xs text-[var(--color-muted)]">{member.email}</p></div></div></td>
              <td className="px-4 py-3"><Badge variant={roleToBadge[member.role]}>{member.role}</Badge></td>
              <td className="px-4 py-3 text-sm text-[var(--color-muted)]">{member.createdAt ? new Date(member.createdAt).toLocaleDateString() : '—'}</td>
              <td className="px-4 py-3 text-right"><div className="inline-flex items-center gap-2">
                {canChange(member) ? <Select aria-label={`Change ${member.name}'s role`} value={member.role} disabled={busy === member.userId} onChange={(event) => { const nextRole = event.target.value as Role; void act(member.userId, () => apiFetch(`/api/workspaces/${workspaceId}/members/${member.userId}`, { method: 'PATCH', body: JSON.stringify({ role: nextRole }) })); }} className="w-32">
                  {actorRole === 'OWNER' ? <option value="ADMIN">Admin</option> : null}<option value="MEMBER">Member</option><option value="VIEWER">Viewer</option>
                </Select> : null}
                {canRemove(member) ? <Button variant="secondary" size="sm" disabled={busy === member.userId} onClick={() => { if (window.confirm(`Remove ${member.name} from this workspace?`)) void act(member.userId, () => apiFetch(`/api/workspaces/${workspaceId}/members/${member.userId}`, { method: 'DELETE' })); }}>{busy === member.userId ? 'Saving…' : member.userId === user?.id ? 'Leave' : 'Remove'}</Button> : null}
              </div></td>
            </tr>)}</tbody>
          </table></div>
        )}
      </section>

      {canInvite ? <section className="rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="border-b border-[var(--color-border)] px-4 py-3"><h2 className="text-sm font-medium text-[var(--color-text)]">Pending invitations</h2></div>
        {invitesQuery.isLoading ? <p className="p-4 text-sm text-[var(--color-muted)]">Loading invitations…</p> : invitations.length === 0 ? <p className="p-4 text-sm text-[var(--color-muted)]">No pending invitations.</p> : <ul className="divide-y divide-[var(--color-border)]">{invitations.map((invite) => <li key={invite.id} className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="text-sm text-[var(--color-text)]">{invite.email}</p><p className="text-xs text-[var(--color-muted)]">{invite.role} · expires {new Date(invite.expiresAt).toLocaleDateString()}</p></div><Button variant="secondary" size="sm" disabled={busy === invite.id} onClick={() => { void act(invite.id, () => apiFetch(`/api/workspaces/${workspaceId}/invitations/${invite.id}`, { method: 'DELETE' })); }}>Revoke</Button></li>)}</ul>}
      </section> : null}
    </div>
  );
}
