import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, clearAuthState, getAccessToken, setAccessToken } from './api';

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

afterEach(() => {
  clearAuthState();
  vi.unstubAllGlobals();
});

describe('frontend API client', () => {
  it('keeps the access token in memory and clears it on logout', () => {
    setAccessToken('ephemeral-access-token');
    expect(getAccessToken()).toBe('ephemeral-access-token');
    clearAuthState();
    expect(getAccessToken()).toBeNull();
  });

  it('sends authenticated JSON requests with cookie credentials', async () => {
    setAccessToken('access-token');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ saved: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch<{ saved: boolean }>('/api/workspaces/one', {
      method: 'POST',
      body: JSON.stringify({ name: 'Team' }),
    })).resolves.toEqual({ saved: true });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(init.credentials).toBe('include');
    expect(headers.get('Authorization')).toBe('Bearer access-token');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('refreshes once after a 401 and retries with the new access token', async () => {
    setAccessToken('expired-access-token');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'rotated-access-token' }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiFetch<{ ok: boolean }>('/api/workspaces/one'))
      .resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/auth/refresh');
    const [, retryInit] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(new Headers(retryInit.headers).get('Authorization')).toBe('Bearer rotated-access-token');
    expect(getAccessToken()).toBe('rotated-access-token');
  });

  it('clears auth and reports an expired session when refresh fails', async () => {
    setAccessToken('expired-access-token');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(jsonResponse({}, 401));
    vi.stubGlobal('fetch', fetchMock);

    const failure = await apiFetch('/api/workspaces/one', {}, { redirectOnFailure: false }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ code: 'SESSION_EXPIRED', status: 401 });
    expect(getAccessToken()).toBeNull();
  });
});
