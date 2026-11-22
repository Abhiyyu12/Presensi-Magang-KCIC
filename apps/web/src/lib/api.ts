// Typed fetch wrapper for the KCIC attendance REST API (base path /api/v1).
// - credentials: 'include' on every request (session cookie is HttpOnly).
// - Unwraps the success envelope { data, meta } and returns `data`.
// - Maps the error envelope to ApiError.
// - Lazily fetches and caches the CSRF token; sends x-csrf-token on mutations.
// - 401 responses invoke a registered unauthorized handler (redirect to /login).

export const API_BASE = '/api/v1';

export interface ApiFieldErrors {
  [field: string]: string[] | string | undefined;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly fieldErrors?: ApiFieldErrors;
  readonly requestId?: string;

  constructor(
    code: string,
    message: string,
    status: number,
    fieldErrors?: ApiFieldErrors,
    requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.requestId = requestId;
  }
}

let cachedCsrfToken: string | null = null;
let csrfRequest: Promise<string | null> | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export function clearCsrfCache(): void {
  cachedCsrfToken = null;
  csrfRequest = null;
}

function readToken(data: unknown): string | null {
  if (typeof data === 'object' && data !== null && 'token' in data) {
    const token = (data as { token?: unknown }).token;
    if (typeof token === 'string' && token.length > 0) return token;
  }
  return null;
}

function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match?.[1] ?? null;
}

export async function ensureCsrfToken(): Promise<string | null> {
  // The cookie is the source of truth: login and change-password rotate it
  // server-side, so a token cached in memory can be stale after those calls.
  const cookieToken = readCsrfCookie();
  if (cookieToken) {
    cachedCsrfToken = cookieToken;
    return cookieToken;
  }
  if (cachedCsrfToken) return cachedCsrfToken;
  if (!csrfRequest) {
    csrfRequest = fetch(`${API_BASE}/auth/csrf`, {
      method: 'GET',
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const body: unknown = await res.json();
        if (typeof body === 'object' && body !== null && 'data' in body) {
          return readToken((body as { data?: unknown }).data);
        }
        return readToken(body);
      })
      .catch(() => null)
      .finally(() => {
        csrfRequest = null;
      });
  }
  const token = await csrfRequest;
  if (token) cachedCsrfToken = token;
  return token;
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** JSON-serializable body, or FormData when isForm is true. */
  body?: unknown;
  /** Send body as multipart/form-data (do NOT set Content-Type manually). */
  isForm?: boolean;
  /** Required for attendance/leave-movement POSTs; reuse the same key on retry. */
  idempotencyKey?: string;
  /** Optional query parameters (undefined values are skipped). */
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
}

export function buildQuery(query?: ApiOptions['query']): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

interface ErrorEnvelope {
  error?: {
    code?: unknown;
    message?: unknown;
    fieldErrors?: unknown;
    requestId?: unknown;
  };
}

function toApiError(status: number, body: unknown): ApiError {
  if (typeof body === 'object' && body !== null) {
    const err = (body as ErrorEnvelope).error;
    if (err && typeof err === 'object') {
      return new ApiError(
        typeof err.code === 'string' ? err.code : 'UNKNOWN_ERROR',
        typeof err.message === 'string' ? err.message : 'Terjadi kesalahan pada server.',
        status,
        typeof err.fieldErrors === 'object' && err.fieldErrors !== null
          ? (err.fieldErrors as ApiFieldErrors)
          : undefined,
        typeof err.requestId === 'string' ? err.requestId : undefined,
      );
    }
  }
  return new ApiError('UNKNOWN_ERROR', 'Terjadi kesalahan pada server.', status);
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const isMutation = method !== 'GET';
  const headers: Record<string, string> = {};

  if (isMutation) {
    const token = await ensureCsrfToken();
    if (token) headers['x-csrf-token'] = token;
  }
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    if (options.isForm) {
      body = options.body as FormData;
    } else {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}${buildQuery(options.query)}`, {
      method,
      headers,
      body,
      credentials: 'include',
      signal: options.signal,
    });
  } catch (networkError) {
    if (networkError instanceof DOMException && networkError.name === 'AbortError') {
      throw networkError;
    }
    throw new ApiError(
      'NETWORK_ERROR',
      'Tidak dapat menghubungi server. Periksa koneksi internet Anda, lalu coba lagi.',
      0,
    );
  }

  if (res.status === 401) {
    cachedCsrfToken = null;
    if (unauthorizedHandler) unauthorizedHandler();
  }

  const contentType = res.headers.get('content-type') ?? '';
  const payload: unknown = contentType.includes('application/json')
    ? await res.json().catch(() => null)
    : null;

  if (!res.ok) {
    throw toApiError(res.status, payload);
  }

  // Success envelope: { data, meta }. Some endpoints may return raw data.
  if (typeof payload === 'object' && payload !== null && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export function fieldErrorMessage(
  fieldErrors: ApiFieldErrors | undefined,
  field: string,
): string | undefined {
  if (!fieldErrors) return undefined;
  const value = fieldErrors[field];
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0) return value[0];
  return undefined;
}
