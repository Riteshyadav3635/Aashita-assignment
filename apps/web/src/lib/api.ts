import type { User } from './types';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(code: string, status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

export function clearAuthState() {
  accessToken = null;
  refreshInFlight = null;
}

async function refreshAccessToken() {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json().catch(() => ({}))) as {
      accessToken?: string;
      token?: string;
      user?: User | null;
    };

    const nextToken = payload.accessToken ?? payload.token ?? null;
    if (nextToken) {
      accessToken = nextToken;
      return nextToken;
    }

    return null;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export async function apiFetch<T>(
  input: string,
  init: RequestInit = {},
  options: { redirectOnFailure?: boolean } = {},
): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers ?? {});

  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  if (method !== 'GET' && method !== 'HEAD' && !headers.has('Content-Type') && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  let response = await fetch(input, {
    ...init,
    credentials: 'include',
    headers,
  });

  if (
    response.status === 401 &&
    !input.includes('/api/auth/refresh') &&
    !input.includes('/api/auth/login') &&
    !input.includes('/api/auth/signup')
  ) {
    const refreshedToken = await refreshAccessToken();

    if (refreshedToken) {
      headers.set('Authorization', `Bearer ${refreshedToken}`);
      response = await fetch(input, {
        ...init,
        credentials: 'include',
        headers,
      });
    } else {
      clearAuthState();
      if (typeof window !== 'undefined' && options.redirectOnFailure !== false) {
        window.location.assign('/login');
      }
      throw new ApiError('SESSION_EXPIRED', 401, 'Your session expired. Please sign in again.');
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const errorPayload = isRecord(payload) && isRecord(payload.error) ? payload.error : {};
    const message = typeof errorPayload.message === 'string' ? errorPayload.message : 'Request failed';
    const code = typeof errorPayload.code === 'string' ? errorPayload.code : 'UNKNOWN_ERROR';
    const details = isRecord(errorPayload) ? errorPayload.details : undefined;
    throw new ApiError(code, response.status, message, details);
  }

  return payload as T;
}
