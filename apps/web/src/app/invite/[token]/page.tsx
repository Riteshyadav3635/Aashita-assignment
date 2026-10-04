'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export default function InvitePage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = params.token;
  const { user, loading, refreshSession } = useAuth();
  const [status, setStatus] = useState('Accepting your invitation...');

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!user) {
      router.replace(`/login?next=/invite/${token}`);
      return;
    }

    const acceptInvite = async () => {
      try {
        const result = await apiFetch<{ membership: { workspaceId: string } }>('/api/invitations/accept', {
          method: 'POST',
          body: JSON.stringify({ token }),
        });
        await refreshSession();
        setStatus('Invite accepted. Redirecting to your workspace...');
        setTimeout(() => router.replace(`/w/${result.membership.workspaceId}`), 800);
      } catch (error) {
        const message = error instanceof ApiError ? error.message : 'This invitation could not be processed.';
        setStatus(message);
      }
    };

    void acceptInvite();
  }, [loading, refreshSession, router, token, user]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/80 p-8 text-center">
        <p className="text-sm uppercase tracking-[0.3em] text-sky-400">Invitation</p>
        <h1 className="mt-3 text-2xl font-semibold text-white">Workspace access</h1>
        <p className="mt-4 text-slate-300">{status}</p>
      </div>
    </main>
  );
}
