import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Di file ini geocoding diaktifkan untuk menguji helper dengan fetch yang
// di-stub; suite utama (setup.ts) mematikannya agar deterministik.
process.env.GEOCODE_ENABLED = 'true';

import { reverseGeocode } from '../src/common/geocode.js';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterAll(() => vi.unstubAllGlobals());

describe('reverseGeocode (Nominatim best-effort)', () => {
  it('mengembalikan display_name dan meng-cache panggilan ulang', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ display_name: 'Jalan Uji 123, Bandung, Jawa Barat' }), { status: 200 }),
    );
    const first = await reverseGeocode(-6.2, 107.0);
    expect(first).toBe('Jalan Uji 123, Bandung, Jawa Barat');
    const second = await reverseGeocode(-6.2, 107.0);
    expect(second).toBe('Jalan Uji 123, Bandung, Jawa Barat');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('kegagalan jaringan tidak melempar error (null)', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(await reverseGeocode(-6.3, 107.1)).toBeNull();
  });

  it('respons tidak ok tetap null', async () => {
    fetchMock.mockResolvedValue(new Response('forbidden', { status: 403 }));
    expect(await reverseGeocode(-6.4, 107.2)).toBeNull();
  });

  it('display_name kosong tetap null', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    expect(await reverseGeocode(-6.5, 107.3)).toBeNull();
  });
});
