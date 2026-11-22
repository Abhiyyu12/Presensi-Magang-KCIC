import { loadEnv } from '../config/env.js';

const CACHE_MAX = 500;
const TIMEOUT_MS = 5000;

// Kunci cache dibulatkan ke 4 desimal (~11 m) agar koordinat yang berpindah
// sedikit tidak memicu panggilan ulang ke layanan geocoding.
const cache = new Map<string, string>();

function cacheKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
}

/**
 * Reverse-geocoding best-effort via Nominatim (OpenStreetMap): koordinat ->
 * alamat terperinci. Tidak pernah melempar error — kegagalan jaringan/layanan
 * hanya berarti alamat tidak tersedia (event tetap sah tanpa alamat).
 */
export async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  const env = loadEnv();
  if (!env.GEOCODE_ENABLED) return null;
  const key = cacheKey(latitude, longitude);
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const url = new URL('/reverse', env.GEOCODE_BASE_URL);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('zoom', '18');
    url.searchParams.set('accept-language', 'id');
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'PresensiMagangKCIC/0.1 (development)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { display_name?: unknown };
    const name = typeof body.display_name === 'string' ? body.display_name.trim() : '';
    if (!name) return null;
    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(key, name);
    return name;
  } catch {
    return null;
  }
}
