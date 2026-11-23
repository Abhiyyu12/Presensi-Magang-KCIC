// @vitest-environment jsdom
// Regression: panel Hak Akses & Permission harus menampilkan empty state
// "Pilih role dahulu" saat belum ada role terpilih (roleId kosong).
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../lib/api', () => ({
  ApiError: class ApiError extends Error {},
  api: vi.fn(),
}));

import { api } from '../../lib/api';
import { RolesPermissionsPanel } from './RolesPermissionsPanel';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const apiMock = api as unknown as ReturnType<typeof vi.fn>;

function apiRoute(url: string): unknown {
  if (url.startsWith('/admin/access/roles')) return { data: [], meta: { page: 1, pageSize: 100, total: 0, totalPages: 0 } };
  if (url.startsWith('/admin/access/permission-tree')) return { menus: [] };
  if (url.startsWith('/admin/access/role-templates')) return { items: [] };
  throw new Error(`unexpected api call: ${url}`);
}

describe('RolesPermissionsPanel empty state', () => {
  beforeEach(() => {
    apiMock.mockImplementation((url: string) => Promise.resolve(apiRoute(url)));
  });
  afterEach(() => {
    apiMock.mockReset();
  });

  it('menampilkan empty state "Pilih role dahulu" saat belum ada role terpilih', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const root = createRoot(container);
    act(() => {
      root.render(
        <QueryClientProvider client={client}>
          <RolesPermissionsPanel />
        </QueryClientProvider>,
      );
    });
    // react-query menyelesaikan query dalam beberapa ronde microtask;
    // poll di dalam act sampai state final ter-flush (bukan sekadar satu await).
    await act(async () => {
      const deadline = Date.now() + 2000;
      while (!container.textContent.includes('Pilih role dahulu') && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    });
    expect(container.textContent).toContain('Pilih role dahulu');
    expect(container.textContent).toContain('Pilih salah satu role di atas');
    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
