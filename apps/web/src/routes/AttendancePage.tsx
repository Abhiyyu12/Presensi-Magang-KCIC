import { useCallback, useEffect, useState } from 'react';
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
import { useAttendanceSubmit } from '../hooks/useAttendanceSubmit';

type FlowStep = 'explain' | 'capture' | 'confirm' | 'done';

export default function AttendancePage() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<FlowStep>('explain');
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

  // Only the next valid action is offered (server day status remains truth).
  useEffect(() => {
    if (!today) return;
    const requested = searchParams.get('action');
    const next: EventType = !hasCheckIn ? 'CHECK_IN' : 'CHECK_OUT';
    setAction(requested === 'check-out' && hasCheckIn && !hasCheckOut ? 'CHECK_OUT' : next);
  }, [today, hasCheckIn, hasCheckOut, searchParams]);

  const geolocation = useGeolocation();
  const [location, setLocation] = useState<LocationFix | null>(null);

  const submitter = useAttendanceSubmit({
    eventType: action,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
  });

  const startFlow = useCallback(() => {
    submitter.beginAttempt();
    setStep('capture');
    void geolocation.acquire().then(setLocation);
  }, [submitter, geolocation]);

  const onCaptured = useCallback((blob: Blob, previewUrl: string) => {
    setPhoto({ blob, previewUrl });
  }, []);

  // Move to confirm once both photo and location exist.
  useEffect(() => {
    if (step === 'capture' && photo && location) setStep('confirm');
  }, [step, photo, location]);

  const doSubmit = useCallback(async () => {
    if (!photo || !location) return;
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

  const completeToday = hasCheckIn && hasCheckOut;
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
          Status hari ini: <StatusBadge status={today.attendanceDay?.dayStatus ?? 'SCHEDULED'} />
          {today.workday?.isWorkingDay ? (
            <>
              {' '}
              · Jadwal {formatTimeWib(today.workday.startTime)}–{formatTimeWib(today.workday.endTime)}{' '}
              WIB
            </>
          ) : (
            ' · Hari ini tidak terjadwal'
          )}
        </p>
      </header>

      {step === 'done' && submitter.result ? (
        <section className="card border-green-200 bg-green-50" aria-live="polite">
          <p className="text-sm font-semibold text-green-800">Absensi berhasil disimpan.</p>
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
                Lokasi tercatat{location ? ` (±${formatMeters(location.accuracyMeters)})` : ''}
              </dd>
            </div>
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
              Kembali ke Dashboard
            </Link>
            <Link to="/riwayat" className="btn-primary flex-1">
              Lihat Riwayat
            </Link>
          </div>
        </section>
      ) : completeToday ? (
        <section className="card">
          <p className="text-sm text-slate-700">
            Absensi hari ini sudah lengkap (check-in dan check-out tercatat). Status:{' '}
            <StatusBadge status={today.attendanceDay?.dayStatus} />
          </p>
          {today.attendanceDay?.dayStatus === 'NEEDS_REVIEW' ? (
            <p className="mt-2 text-sm text-purple-700">
              Catatan hari ini perlu diperiksa oleh admin.
            </p>
          ) : null}
          <Link to="/riwayat" className="btn-secondary mt-3">
            Lihat Riwayat
          </Link>
        </section>
      ) : step === 'explain' ? (
        <section className="card space-y-3">
          <p className="text-sm text-slate-700">
            Aksi berikutnya: <strong>{action === 'CHECK_IN' ? 'Check-in' : 'Check-out'}</strong>.
            Sebelum mulai, perhatikan persyaratan berikut:
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>Izinkan akses kamera untuk mengambil selfie absensi.</li>
            <li>
              Lokasi diperlukan sebagai bukti saat absensi. Lokasi tidak digunakan untuk melacak
              Anda terus-menerus.
            </li>
            <li>Waktu resmi menggunakan waktu server, bukan waktu perangkat.</li>
            <li>Jangan tutup halaman selama proses pengiriman berlangsung.</li>
          </ul>
          <button type="button" className="btn-primary w-full" onClick={startFlow}>
            Mulai {action === 'CHECK_IN' ? 'Check-in' : 'Check-out'}
          </button>
        </section>
      ) : (
        <section className="card space-y-4">
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
            onRetry={() => void geolocation.acquire().then(setLocation)}
          />

          {step === 'confirm' && photo && location ? (
            <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-800">Konfirmasi absensi</p>
              <dl className="space-y-1 text-sm text-slate-700">
                <div className="flex justify-between gap-2">
                  <dt>Waktu server</dt>
                  <dd className="font-medium">{formatWib(today.serverTime)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Aksi</dt>
                  <dd className="font-medium">{action === 'CHECK_IN' ? 'Check-in' : 'Check-out'}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Akurasi lokasi</dt>
                  <dd className="font-medium">±{formatMeters(location.accuracyMeters)}</dd>
                </div>
              </dl>
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
                    setStep('explain');
                  }}
                  disabled={submitter.phase === 'submitting'}
                >
                  Batalkan
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

          {step === 'capture' ? (
            <p className="text-xs text-slate-500">
              Ambil foto selfie dan tunggu lokasi diperoleh, lalu periksa ringkasan sebelum
              mengirim.
            </p>
          ) : null}
        </section>
      )}
    </div>
  );
}
