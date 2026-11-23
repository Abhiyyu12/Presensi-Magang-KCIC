import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatWib, formatTimeWib, dayStatusLabel, formatMeters } from '../lib/format';
import type { EventType, TodayResponse } from '../lib/types';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { CameraCapture } from '../components/CameraCapture';
import { LocationStatus, useGeolocation, type LocationFix } from '../components/LocationStatus';
import { MapsLink } from '../components/MapsLink';
import { useAttendanceSubmit } from '../hooks/useAttendanceSubmit';
import { useReverseGeocode } from '../hooks/useReverseGeocode';

type FlowStep = 'capture' | 'confirm' | 'done';

export default function AttendancePage() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<FlowStep>('capture');
  const [action, setAction] = useState<EventType>('CHECK_IN');
  const [photo, setPhoto] = useState<{ blob: Blob; previewUrl: string } | null>(null);

  const todayQuery = useQuery({
    queryKey: ['attendance', 'today'],
    queryFn: () => api<TodayResponse>('/attendance/today'),
  });

  const today = todayQuery.data;
  const events = today?.attendanceDay?.events ?? [];
  const hasCheckIn = events.some((e) => e.eventType === 'CHECK_IN');
  const hasCheckOut = events.some((e) => e.eventType === 'CHECK_OUT');
  const isWorkingDay = today?.workday?.isWorkingDay ?? false;
  const completeToday = hasCheckIn && hasCheckOut;

  // Only the next valid action is offered (server day status remains truth).
  useEffect(() => {
    if (!today) return;
    const requested = searchParams.get('action');
    const next: EventType = !hasCheckIn ? 'CHECK_IN' : 'CHECK_OUT';
    setAction(requested === 'check-out' && hasCheckIn && !hasCheckOut ? 'CHECK_OUT' : next);
  }, [today, hasCheckIn, hasCheckOut, searchParams]);

  const geolocation = useGeolocation();
  const [location, setLocation] = useState<LocationFix | null>(null);
  const geocode = useReverseGeocode(location);

  const submitter = useAttendanceSubmit({
    eventType: action,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
  });

  // Start the capture flow automatically on working days so absen is
  // camera-ready without an extra "Mulai" tap. One attempt per page visit.
  const startedRef = useRef(false);
  useEffect(() => {
    if (!today || startedRef.current || !isWorkingDay || completeToday) return;
    startedRef.current = true;
    submitter.beginAttempt();
    void geolocation.acquire().then(setLocation);
  }, [today, isWorkingDay, completeToday, submitter, geolocation]);

  const onCaptured = useCallback((blob: Blob, previewUrl: string) => {
    setPhoto({ blob, previewUrl });
  }, []);

  // Move to confirm once the photo exists — lokasi bersifat opsional (dicatat
  // bila tersedia; absen tetap dapat dikirim tanpa koordinat).
  useEffect(() => {
    if (step === 'capture' && photo) setStep('confirm');
  }, [step, photo]);

  const doSubmit = useCallback(async () => {
    if (!photo) return;
    const result = await submitter.submit({ photo: photo.blob, location });
    if (result) setStep('done');
  }, [photo, location, submitter]);

  if (todayQuery.isLoading) return <LoadingState label="Memuat status absensi…" />;
  if (todayQuery.isError || !today) {
    return (
      <ErrorState
        message={todayQuery.error instanceof Error ? todayQuery.error.message : 'Gagal memuat.'}
        onRetry={() => void todayQuery.refetch()}
      />
    );
  }

  const actionLabel = action === 'CHECK_IN' ? 'Absen Masuk' : 'Absen Pulang';
  const uploadState =
    submitter.phase === 'submitting'
      ? 'uploading'
      : submitter.phase === 'failed'
        ? 'upload_failed'
        : submitter.phase === 'success'
          ? 'completed'
          : null;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <header>
        <h1 className="text-lg font-bold text-slate-900">Absensi</h1>
        <p className="text-sm text-slate-600">
          Status hari ini:{' '}
          <StatusBadge
            status={today.attendanceDay?.dayStatus ?? (isWorkingDay ? 'SCHEDULED' : 'NOT_SCHEDULED')}
          />
          {isWorkingDay && today.workday ? (
            <>
              {' '}
              · Jadwal {formatTimeWib(today.workday.startTime)}–{formatTimeWib(today.workday.endTime)}{' '}
              WIB
            </>
          ) : null}
        </p>
      </header>

      {!isWorkingDay ? (
        <section className="card border-slate-200 bg-slate-50">
          <p className="text-sm font-semibold text-slate-800">
            Hari ini bukan hari kerja terjadwal.
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Absen masuk dan absen pulang tidak tersedia. Jika jadwal Anda seharusnya berbeda,
            hubungi admin HR.
          </p>
          <Link to="/riwayat" className="btn-secondary mt-3">
            Lihat Riwayat
          </Link>
        </section>
      ) : step === 'done' && submitter.result ? (
        <section
          className="card border-green-200 bg-green-50 success-enter"
          aria-live="polite"
        >
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="success-pop flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600 text-white"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </span>
            <p className="text-sm font-semibold text-green-800">Absensi berhasil disimpan.</p>
          </div>
          <dl className="mt-3 space-y-1 text-sm text-green-900">
            <div className="flex justify-between gap-2">
              <dt>Waktu server</dt>
              <dd className="font-medium">{formatWib(submitter.result.occurredAtServer)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Status hari</dt>
              <dd>
                <StatusBadge status={submitter.result.dayStatus} />
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Lokasi</dt>
              <dd className="font-medium">
                {location ? (
                  <>
                    Tercatat (±{formatMeters(location.accuracyMeters)}) ·{' '}
                    <MapsLink latitude={location.latitude} longitude={location.longitude} />
                  </>
                ) : (
                  'Tidak tercatat (izin/GPS tidak tersedia)'
                )}
              </dd>
            </div>
            {submitter.result?.address ? (
              <div className="flex justify-between gap-2">
                <dt>Alamat</dt>
                <dd className="max-w-[70%] text-right font-medium">{submitter.result.address}</dd>
              </div>
            ) : null}
          </dl>
          {photo ? (
            <img
              src={photo.previewUrl}
              alt="Bukti selfie absensi yang terkirim"
              className="mt-3 w-32 rounded-lg border border-green-200 object-cover"
            />
          ) : null}
          {submitter.result.isLate ? (
            <p className="mt-2 text-sm text-amber-800">
              Server mencatat event ini sebagai terlambat ({dayStatusLabel(submitter.result.dayStatus)}).
            </p>
          ) : null}
          <div className="mt-4 flex gap-2">
            <Link to="/" className="btn-secondary flex-1">
              Kembali ke Beranda
            </Link>
            <Link to="/riwayat" className="btn-primary flex-1">
              Lihat Riwayat
            </Link>
          </div>
        </section>
      ) : completeToday ? (
        <section className="card">
          <p className="text-sm text-slate-700">
            Absensi hari ini sudah lengkap (absen masuk dan absen pulang tercatat). Status:{' '}
            <StatusBadge status={today.attendanceDay?.dayStatus} />
          </p>
          {today.attendanceDay?.dayStatus === 'NEEDS_REVIEW' ? (
            <p className="mt-2 text-sm text-amber-700">
              Catatan hari ini perlu diperiksa oleh admin.
            </p>
          ) : null}
          <Link to="/riwayat" className="btn-secondary mt-3">
            Lihat Riwayat
          </Link>
        </section>
      ) : (
        <section className="card space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">{actionLabel}</h2>
            <p className="mt-1 text-xs text-slate-500">
              Ambil selfie, lalu izinkan lokasi saat diminta. Lokasi dicatat sebagai bukti bila
              tersedia — absen tetap bisa dikirim tanpa lokasi. Waktu resmi memakai waktu server.
              Jangan tutup halaman selama pengiriman berlangsung.
            </p>
          </div>
          <CameraCapture
            onCaptured={onCaptured}
            uploadState={uploadState}
            uploadErrorMessage={submitter.error?.message}
            onRetake={() => {
              setPhoto(null);
              setStep('capture');
            }}
          />
          <LocationStatus
            state={geolocation.state}
            fix={geolocation.fix}
            address={geocode.data?.address ?? null}
            onRetry={() => void geolocation.acquire().then(setLocation)}
          />

          {step === 'confirm' && photo ? (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-800">Konfirmasi absensi</p>
              <dl className="space-y-1 text-sm text-slate-700">
                <div className="flex justify-between gap-2">
                  <dt>Waktu server</dt>
                  <dd className="font-medium">{formatWib(today.serverTime)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Aksi</dt>
                  <dd className="font-medium">{actionLabel}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Akurasi lokasi</dt>
                  <dd className="font-medium">
                    {location ? `±${formatMeters(location.accuracyMeters)}` : 'Lokasi tidak tercatat'}
                  </dd>
                </div>
              </dl>
              {!location ? (
                <p className="text-xs text-amber-700">
                  Izin lokasi/GPS tidak tersedia, jadi koordinat tidak ikut terkirim. Anda tetap
                  dapat mengirim absensi ini.
                </p>
              ) : null}
              <img
                src={photo.previewUrl}
                alt="Foto yang akan dikirim sebagai bukti absensi"
                className="w-24 rounded-lg border border-slate-200 object-cover"
              />
              {submitter.phase === 'failed' ? (
                <p className="text-sm text-red-600" role="alert">
                  {submitter.error?.message ?? 'Pengiriman gagal.'}
                </p>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-secondary flex-1"
                  onClick={() => {
                    setPhoto(null);
                    setLocation(null);
                    geolocation.reset();
                    setStep('capture');
                    void geolocation.acquire().then(setLocation);
                  }}
                  disabled={submitter.phase === 'submitting'}
                >
                  Ulangi Foto
                </button>
                <button
                  type="button"
                  className="btn-primary flex-1"
                  onClick={() => void doSubmit()}
                  disabled={submitter.phase === 'submitting'}
                >
                  {submitter.phase === 'failed' ? 'Kirim Ulang' : 'Kirim Absensi'}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}