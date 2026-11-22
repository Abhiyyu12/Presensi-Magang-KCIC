import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, clearCsrfCache, setUnauthorizedHandler } from './api';

interface MockCall {
  url: string;
  init: RequestInit;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

let calls: MockCall[] = [];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  calls = [];
  clearCsrfCache();
  document.cookie = 'csrf_token=; Max-Age=0; path=/';
  fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    if (url.endsWith('/auth/csrf')) {
      return jsonResponse({ data: { token: 'csrf-test-token' }, meta: { requestId: 'r1' } });
    }
    if (url.endsWith('/ok')) {
      return jsonResponse({ data: { value: 42 }, meta: { requestId: 'r2' } });
    }
    if (url.endsWith('/bad')) {
      return jsonResponse(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Permintaan tidak valid.',
            fieldErrors: { reason: ['Alasan wajib diisi.'] },
            requestId: 'r3',
          },
        },
        400,
      );
    }
    if (url.endsWith('/gone')) {
      return jsonResponse({ error: { code: 'UNAUTHENTICATED', message: 'Sesi berakhir.' } }, 401);
    }
    return jsonResponse({ error: { code: 'NOT_FOUND', message: 'Tidak ditemukan.' } }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(null);
});

describe('api envelope handling', () => {
  it('unwraps the success envelope and returns data', async () => {
    const data = await api<{ value: number }>('/ok');
    expect(data).toEqual({ value: 42 });
  });

  it('maps the error envelope to ApiError with field errors and requestId', async () => {
    const promise = api<unknown>('/bad', { method: 'POST', body: {} });
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    const error = (await promise.catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.status).toBe(400);
    expect(error.message).toBe('Permintaan tidak valid.');
    expect(error.fieldErrors?.['reason']).toEqual(['Alasan wajib diisi.']);
    expect(error.requestId).toBe('r3');
  });

  it('produces a friendly ApiError on network failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const promise = api<unknown>('/ok');
    await expect(promise).rejects.toBeInstanceOf(ApiError);
    const error = (await promise.catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.status).toBe(0);
  });
});

describe('api request shaping', () => {
  it('sends credentials include and no CSRF header on GET', async () => {
    await api<unknown>('/ok');
    const call = calls.find((c) => c.url.endsWith('/ok'));
    expect(call?.init.credentials).toBe('include');
    const headers = call?.init.headers as Record<string, string>;
    expect(headers['x-csrf-token']).toBeUndefined();
  });

  it('lazily fetches CSRF once and sends x-csrf-token on mutations', async () => {
    await api<unknown>('/ok', { method: 'POST', body: { a: 1 } });
    await api<unknown>('/ok', { method: 'POST', body: { a: 2 } });
    const csrfCalls = calls.filter((c) => c.url.endsWith('/auth/csrf'));
    expect(csrfCalls).toHaveLength(1);
    const posts = calls.filter((c) => c.url.endsWith('/ok'));
    for (const post of posts) {
      const headers = post.init.headers as Record<string, string>;
      expect(headers['x-csrf-token']).toBe('csrf-test-token');
      expect(headers['Content-Type']).toBe('application/json');
    }
  });

  it('prefers the rotated csrf_token cookie over a stale in-memory token', async () => {
    await api<unknown>('/ok', { method: 'POST', body: { a: 1 } });
    document.cookie = 'csrf_token=rotated-token-after-login; path=/';
    await api<unknown>('/ok', { method: 'POST', body: { a: 2 } });
    const csrfCalls = calls.filter((c) => c.url.endsWith('/auth/csrf'));
    expect(csrfCalls).toHaveLength(1);
    const posts = calls.filter((c) => c.url.endsWith('/ok'));
    const headers = (posts[1]?.init.headers ?? {}) as Record<string, string>;
    expect(headers['x-csrf-token']).toBe('rotated-token-after-login');
  });

  it('sends the Idempotency-Key header when provided', async () => {
    const form = new FormData();
    form.append('latitude', '1');
    await api<unknown>('/ok', {
      method: 'POST',
      body: form,
      isForm: true,
      idempotencyKey: 'key-123',
    });
    const call = calls.find((c) => c.url.endsWith('/ok'));
    const headers = call?.init.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe('key-123');
    // FormData body must not get a manual Content-Type.
    expect(headers['Content-Type']).toBeUndefined();
    expect(call?.init.body).toBeInstanceOf(FormData);
  });

  it('builds query strings and skips undefined values', async () => {
    await api<unknown>('/ok', { query: { page: 2, dayStatus: undefined, scope: 'mine' } }).catch(() => undefined);
    const call = calls.find((c) => c.url.includes('/ok?'));
    expect(call?.url).toContain('page=2');
    expect(call?.url).toContain('scope=mine');
    expect(call?.url).not.toContain('dayStatus');
  });
});

describe('api 401 handling', () => {
  it('invokes the unauthorized handler on 401', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    await expect(api<unknown>('/gone')).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
