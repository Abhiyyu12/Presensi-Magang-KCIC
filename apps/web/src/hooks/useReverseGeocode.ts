import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { LocationFix } from '../components/LocationStatus';

/**
 * Terjemahan koordinat -> alamat terperinci via backend (Nominatim).
 * Best-effort: bila backend/layanan gagal, alamat tetap null dan UI
 * hanya menampilkan koordinat.
 */
export function useReverseGeocode(fix: LocationFix | null) {
  const lat = fix ? fix.latitude.toFixed(4) : '';
  const lng = fix ? fix.longitude.toFixed(4) : '';
  return useQuery({
    queryKey: ['geocode', lat, lng],
    queryFn: () => api<{ address: string | null }>(`/geocode/reverse?latitude=${lat}&longitude=${lng}`),
    enabled: Boolean(fix),
    staleTime: 10 * 60 * 1000,
  });
}
