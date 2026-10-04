'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiFetch, ApiError, clearAuthState, getAccessToken as readAccessToken, setAccessToken } from './api';
import type { User, WorkspaceSummary } from './types';

type AuthContextData = {
  user: User | null;
  memberships: WorkspaceSummary[];
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  roleForWorkspace: (workspaceId: string) => WorkspaceSummary['role'] | null;
  getAccessToken: () => string | null;
};

const AuthContext = createContext<AuthContextData | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<WorkspaceSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    try {
      const refreshResult = await apiFetch<{ accessToken?: string; token?: string; user?: User | null }>(
        '/api/auth/refresh',
        { method: 'POST' },
        { redirectOnFailure: false },
      );
      const nextToken = refreshResult.accessToken ?? refreshResult.token ?? null;
      if (nextToken) {
        setAccessToken(nextToken);
      }

      const meResult = await apiFetch<{ user: User | null }>('/api/auth/me');
      setUser(meResult.user);

      if (meResult.user) {
        const workspaceResult = await apiFetch<{ workspaces: WorkspaceSummary[] }>('/api/workspaces');
        setMemberships(workspaceResult.workspaces ?? []);
      } else {
        setMemberships([]);
      }
    } catch (error) {
      setUser(null);
      setMemberships([]);
      clearAuthState();
      if (!(error instanceof ApiError && error.status === 401)) {
        console.error('Session restore failed:', error);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const hydrateAfterAuth = useCallback(async (nextUser: User) => {
    setUser(nextUser);
    const workspaceResult = await apiFetch<{ workspaces: WorkspaceSummary[] }>('/api/workspaces');
    setMemberships(workspaceResult.workspaces ?? []);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const loginResult = await apiFetch<{ user: User; accessToken?: string; token?: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    const nextToken = loginResult.accessToken ?? loginResult.token ?? null;
    if (nextToken) {
      setAccessToken(nextToken);
    }

    await hydrateAfterAuth(loginResult.user);
  }, [hydrateAfterAuth]);

  const signup = useCallback(async (name: string, email: string, password: string) => {
    const signupResult = await apiFetch<{ user: User; accessToken?: string; token?: string }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });

    const nextToken = signupResult.accessToken ?? signupResult.token ?? null;
    if (nextToken) {
      setAccessToken(nextToken);
    }

    await hydrateAfterAuth(signupResult.user);
  }, [hydrateAfterAuth]);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore logout errors and force a local sign-out state.
    }

    clearAuthState();
    setUser(null);
    setMemberships([]);
  }, []);

  const roleForWorkspace = useCallback(
    (workspaceId: string) => memberships.find((entry) => entry.workspaceId === workspaceId)?.role ?? null,
    [memberships],
  );

  const value = useMemo<AuthContextData>(
    () => ({
      user,
      memberships,
      loading,
      login,
      signup,
      logout,
      refreshSession,
      roleForWorkspace,
      getAccessToken: () => readAccessToken(),
    }),
    [loading, login, logout, memberships, refreshSession, roleForWorkspace, signup, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function useRole(workspaceId: string) {
  return useAuth().roleForWorkspace(workspaceId);
}
