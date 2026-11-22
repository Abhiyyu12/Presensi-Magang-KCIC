import { useCallback, useEffect, useRef, useState } from 'react';
import { formatMeters } from '../lib/format';

// Location states per DESIGN.md §5:
// idle, requesting_permission, permission_denied, unavailable, low_accuracy, ready.

export type LocationState =
  | 'idle'
  | 'requesting_permission'
  | 'permission_denied'
  | 'unavailable'
  | 'low_accuracy'
  | 'ready';

export interface LocationFix {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
}

const LOW_ACCURACY_THRESHOLD_M = 25;

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
          setState(next.accuracyMeters > LOW_ACCURACY_THRESHOLD_M ? 'low_accuracy' : 'ready');
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
  onRetry?: () => void;
}

export function LocationStatus({ state, fix, onRetry }: LocationStatusProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3" aria-live="polite">
      <p className="text-sm font-medium text-slate-800">Status lokasi</p>
      <p className="mt-1 text-xs text-slate-500">
        Lokasi dicatat sebagai bukti absensi bila tersedia, dan tidak digunakan untuk melacak Anda
        terus-menerus. Absensi tetap dapat dikirim tanpa lokasi.
      </p>

      {state === 'idle' ? <p className="mt-2 text-sm text-slate-600">Lokasi belum diminta.</p> : null}

      {state === 'requesting_permission' ? (
        <p className="mt-2 flex items-center gap-2 text-sm text-slate-600" role="status">
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-700"
            aria-hidden="true"
          />
          Mengambil lokasi saat ini…
        </p>
      ) : null}

      {state === 'ready' && fix ? (
        <p className="mt-2 text-sm text-green-700">
          Lokasi tercatat. Akurasi ±{formatMeters(fix.accuracyMeters)}.
        </p>
      ) : null}

      {state === 'low_accuracy' && fix ? (
        <div className="mt-2">
          <p className="text-sm text-amber-700">
            Lokasi diperoleh dengan akurasi ±{formatMeters(fix.accuracyMeters)} (lebih dari{' '}
            {LOW_ACCURACY_THRESHOLD_M} m). Anda tetap dapat melanjutkan, namun disarankan
            berpindah ke area terbuka lalu perbarui lokasi.
          </p>
          {onRetry ? (
            <button type="button" className="btn-secondary mt-2 px-3 py-1.5 text-xs" onClick={onRetry}>
              Perbarui Lokasi
            </button>
          ) : null}
        </div>
      ) : null}

      {state === 'permission_denied' ? (
        <div className="mt-2">
          <p className="text-sm text-red-600">
            Lokasi belum berhasil diperoleh. Periksa izin lokasi dan layanan lokasi, lalu coba
            kembali. Tanpa lokasi, absensi tetap dapat dikirim namun koordinatnya tidak tercatat.
          </p>
          <p className="mt-1 text-xs text-slate-500">
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
          <p className="mt-1 text-xs text-slate-500">
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
