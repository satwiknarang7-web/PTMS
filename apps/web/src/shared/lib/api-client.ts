import { appConfig } from '@/shared/config/env';
import { routes } from '@/shared/config/routes';

export type QueryValue = string | number | boolean | Date | null | undefined;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue>;
  /** Skip the automatic refresh-and-retry on 401 (used by auth endpoints themselves). */
  skipAuthRefresh?: boolean;
  signal?: AbortSignal;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    params.set(key, value instanceof Date ? value.toISOString() : String(value));
  });
  const qs = params.toString();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const search = qs ? `?${qs}` : '';

  // In server-side functions, use the internal service binding URL if available.
  if (typeof window === 'undefined') {
    const internalUrl = process.env.API_INTERNAL_URL || process.env.API_PROXY_TARGET;
    if (internalUrl) {
      const base = internalUrl.replace(/\/+$/, '');
      const fullPath = normalizedPath.startsWith('/api/') ? normalizedPath.slice(4) : normalizedPath;
      return `${base}${fullPath}${search}`;
    }
  }

  return `${appConfig.apiBasePath}${normalizedPath}${search}`;
}

async function parseError(response: Response): Promise<ApiError> {
  let message = response.statusText || 'Request failed';
  let details: unknown;
  try {
    details = await response.json();
    const raw = (details as { message?: string | string[] }).message;
    if (raw) message = Array.isArray(raw) ? raw.join('. ') : raw;
  } catch {
    /* non-JSON error body */
  }
  return new ApiError(response.status, message, details);
}

/** Single-flight refresh so concurrent 401s trigger only one refresh call. */
let refreshing: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  refreshing ??= fetch(buildUrl('/auth/refresh'), { method: 'POST', credentials: 'include' })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

function redirectToLogin(): void {
  if (typeof window === 'undefined') return;
  if (window.location.pathname.startsWith(routes.login)) return;
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.assign(`${routes.login}?next=${next}`);
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, skipAuthRefresh, signal } = options;
  const init: RequestInit = {
    method,
    credentials: 'include',
    signal,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };

  let response = await fetch(buildUrl(path, query), init);

  if (response.status === 401 && !skipAuthRefresh) {
    if (await refreshSession()) {
      response = await fetch(buildUrl(path, query), init);
    }
    if (response.status === 401) {
      redirectToLogin();
    }
  }

  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string, query?: Record<string, QueryValue>, signal?: AbortSignal) =>
    apiRequest<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
  put: <T = void>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PUT', body }),
  delete: <T = void>(path: string, query?: Record<string, QueryValue>) =>
    apiRequest<T>(path, { method: 'DELETE', query }),
};

export const errorMessage = (error: unknown, fallback = 'Something went wrong'): string =>
  error instanceof Error && error.message ? error.message : fallback;
