import { useCallback, useEffect, useRef, useState } from 'react';
import { formatMeters } from '../lib/format';

// Location states per DESIGN.md §5:
// idle, requesting_permission, permission_denied, unavailable, ready.
// Akurasi rendah tidak lagi dibedakan: lokasi murni bukti, akurasi dicatat apa adanya.

export type LocationState =
  | 'idle'
  | 'requesting_permission'
  | 'permission_denied'
  | 'unavailable'
  | 'ready';

export interface LocationFix {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
}

export function useGeolocation() {
  const [state, setState] = useState<LocationState>('idle');
  const [fix, setFix] = useState<LocationFix | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const acquire = useCallback(async (): Promise<LocationFix | null> => {
    if (!navigator.geolocation) {
      setState('unavailable');
      return null;
    }
    setState('requesting_permission');
    return new Promise<LocationFix | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const next: LocationFix = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracyMeters: position.coords.accuracy,
          };
          setFix(next);
          setState('ready');
          resolve(next);
        },
        (error) => {
          setFix(null);
          setState(error.code === error.PERMISSION_DENIED ? 'permission_denied' : 'unavailable');
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    });
  }, []);

  const reset = useCallback(() => {
    setFix(null);
    setState('idle');
  }, []);

  return { state, fix, acquire, reset };
}

interface LocationStatusProps {
  state: LocationState;
  fix: LocationFix | null;
  /** Alamat terperinci hasil reverse-geocoding backend (bila berhasil). */
  address?: string | null;
  onRetry?: () => void;
}

export function LocationStatus({ state, fix, address, onRetry }: LocationStatusProps) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3" aria-live="polite">
      <p className="text-sm font-medium text-stone-800">Status lokasi</p>
      <p className="mt-1 text-xs text-stone-500">
        Lokasi dicatat sebagai bukti absensi bila tersedia, dan tidak digunakan untuk melacak Anda
        terus-menerus. Absensi tetap dapat dikirim tanpa lokasi.
      </p>

      {state === 'idle' ? <p className="mt-2 text-sm text-stone-600">Lokasi belum diminta.</p> : null}

      {state === 'requesting_permission' ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-stone-600" role="status">
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-brand-700"
            aria-hidden="true"
          />
          Mengambil lokasi saat ini…
        </p>
      ) : null}

      {state === 'ready' && fix ? (
        <div className="mt-2">
          <p className="text-sm text-green-700">
            Lokasi tercatat. Akurasi ±{formatMeters(fix.accuracyMeters)} — akurasi tergantung
            perangkat dan tidak membatasi absensi.
          </p>
          {address ? (
            <p className="mt-1 text-xs text-stone-600">
              Alamat terperinci (© OpenStreetMap): {address}
            </p>
          ) : null}
        </div>
      ) : null}

      {state === 'permission_denied' ? (
        <div className="mt-2">
          <p className="text-sm text-red-600">
            Lokasi belum berhasil diperoleh. Periksa izin lokasi dan layanan lokasi, lalu coba
            kembali. Tanpa lokasi, absensi tetap dapat dikirim namun koordinatnya tidak tercatat.
          </p>
          <p className="mt-1 text-xs text-stone-500">
            Izinkan akses lokasi untuk situs ini melalui ikon pengaturan di bilah alamat browser,
            lalu tekan tombol di bawah.
          </p>
          {onRetry ? (
            <button type="button" className="btn-secondary mt-2 px-3 py-1.5 text-xs" onClick={onRetry}>
              Coba Lagi
            </button>
          ) : null}
        </div>
      ) : null}

      {state === 'unavailable' ? (
        <div className="mt-2">
          <p className="text-sm text-red-600">
            Lokasi belum berhasil diperoleh. Periksa izin lokasi dan layanan lokasi, lalu coba
            kembali. Tanpa lokasi, absensi tetap dapat dikirim namun koordinatnya tidak tercatat.
          </p>
          <p className="mt-1 text-xs text-stone-500">
            Pastikan layanan lokasi (GPS) aktif pada perangkat dan browser mendukung akses lokasi.
          </p>
          {onRetry ? (
            <button type="button" className="btn-secondary mt-2 px-3 py-1.5 text-xs" onClick={onRetry}>
              Coba Lagi
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
