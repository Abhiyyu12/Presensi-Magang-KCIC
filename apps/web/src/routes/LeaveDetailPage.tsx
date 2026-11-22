import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import {
  EVENT_TYPE_LABELS,
  formatWib,
  formatMeters,
  LEAVE_TYPE_LABELS,
} from '../lib/format';
import type { Leave } from '../lib/types';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CameraCapture } from '../components/CameraCapture';
import { LocationStatus, useGeolocation, type LocationFix } from '../components/LocationStatus';
import { useAttendanceSubmit } from '../hooks/useAttendanceSubmit';

type Movement = 'departure' | 'return' | 'early-checkout';

const MOVEMENT_LABELS: Record<Movement, string> = {
  departure: 'Keluar',
  return: 'Kembali',
  'early-checkout': 'Pulang Lebih Awal',
};

export default function LeaveDetailPage() {
  const { leaveId } = useParams<{ leaveId: string }>();
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [movement, setMovement] = useState<Movement | null>(null);
  const [photo, setPhoto] = useState<{ blob: Blob; previewUrl: string } | null>(null);
  const [location, setLocation] = useState<LocationFix | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const leaveQuery = useQuery({
    queryKey: ['leave', leaveId],
    queryFn: () => api<Leave>(`/leaves/${leaveId}`),
    enabled: Boolean(leaveId),
  });

  const geolocation = useGeolocation();
  const submitter = useAttendanceSubmit({
    eventType: 'DEPARTURE',
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leave', leaveId] });
      void queryClient.invalidateQueries({ queryKey: ['leaves'] });
      void queryClient.invalidateQueries({ queryKey: ['attendance'] });
    },
  });

  const leave = leaveQuery.data;

  const startMovement = useCallback(
    (next: Movement) => {
      setActionError(null);
      setPhoto(null);
      setLocation(null);
      geolocation.reset();
      submitter.beginAttempt();
      setMovement(next);
      void geolocation.acquire().then(setLocation);
    },
    [geolocation, submitter],
  );

  const submitMovement = useCallback(async () => {
    if (!movement || !photo || !location || !leaveId) return;
    const result = await submitter.submit({
      photo: photo.blob,
      location,
      endpoint: `/leaves/${leaveId}/${movement}`,
    });
    if (result) {
      setMovement(null);
      setPhoto(null);
    }
  }, [movement, photo, location, leaveId, submitter]);

  const cancelMutation = useCallback(
    () =>
      api<Leave>(`/leaves/${leaveId}/cancel`, { method: 'POST' }).then(() => {
        setCancelOpen(false);
        void queryClient.invalidateQueries({ queryKey: ['leave', leaveId] });
        void queryClient.invalidateQueries({ queryKey: ['leaves'] });
      }),
    [leaveId, queryClient],
  );

  if (leaveQuery.isLoading) return <LoadingState label="Memuat detail izin…" />;
  if (leaveQuery.isError || !leave) {
    return (
      <ErrorState
        message={leaveQuery.error instanceof Error ? leaveQuery.error.message : 'Gagal memuat.'}
        onRetry={() => void leaveQuery.refetch()}
      />
    );
  }

  const status = leave.status;
  const isTemporary = leave.leaveType === 'TEMPORARY';
  const canDepart = status === 'APPROVED' && isTemporary;
  const canEarlyCheckout = status === 'APPROVED' && !isTemporary;
  const canReturn = status === 'DEPARTED';
  const canCancel = status === 'PENDING';

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
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Detail Izin</h1>
          <p className="text-sm text-slate-600">
            {LEAVE_TYPE_LABELS[leave.leaveType] ?? leave.leaveType}
            {leave.categoryName ? ` · ${leave.categoryName}` : ''}
          </p>
        </div>
        <StatusBadge kind="leaveStatus" status={leave.status} />
      </header>

      <section className="card space-y-2 text-sm text-slate-700">
        <p>
          <span className="text-slate-500">Alasan:</span> {leave.reason ?? '-'}
        </p>
        <p>
          <span className="text-slate-500">Estimasi keluar:</span>{' '}
          {formatWib(leave.estimatedDepartureAt)}
        </p>
        {isTemporary ? (
          <p>
            <span className="text-slate-500">Estimasi kembali:</span>{' '}
            {formatWib(leave.estimatedReturnAt)}
          </p>
        ) : null}
        {leave.decisionNote ? (
          <p>
            <span className="text-slate-500">Catatan keputusan:</span> {leave.decisionNote}
          </p>
        ) : null}
        {status === 'PENDING' ? (
          <p className="text-amber-700">Pengajuan izin menunggu persetujuan.</p>
        ) : null}
        {status === 'NEEDS_REVIEW' ? (
          <p className="text-amber-700">Catatan hari ini perlu diperiksa oleh admin.</p>
        ) : null}
      </section>

      <section className="card" aria-labelledby="timeline-heading">
        <h2 id="timeline-heading" className="text-sm font-semibold text-slate-800">
          Timeline pergerakan
        </h2>
        {leave.events && leave.events.length > 0 ? (
          <ol className="mt-3 space-y-3 border-l-2 border-slate-200 pl-4">
            {leave.events.map((event) => (
              <li key={event.id} className="relative text-sm">
                <span
                  aria-hidden="true"
                  className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-600"
                />
                <p className="font-medium text-slate-800">
                  {EVENT_TYPE_LABELS[event.eventType] ?? event.eventType}
                </p>
                <p className="text-xs text-slate-500">{formatWib(event.occurredAtServer)}</p>
                {event.accuracyMeters != null ? (
                  <p className="text-xs text-slate-500">
                    Akurasi lokasi ±{formatMeters(event.accuracyMeters)}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Belum ada pergerakan tercatat.</p>
        )}
      </section>

      {(canDepart || canReturn || canEarlyCheckout) && movement === null ? (
        <section className="card space-y-2">
          <h2 className="text-sm font-semibold text-slate-800">Catat pergerakan</h2>
          <p className="text-xs text-slate-500">
            Pergerakan dicatat dengan selfie, lokasi, dan waktu server.
          </p>
          <div className="flex flex-wrap gap-2">
            {canDepart ? (
              <button type="button" className="btn-primary" onClick={() => startMovement('departure')}>
                Keluar
              </button>
            ) : null}
            {canReturn ? (
              <button type="button" className="btn-primary" onClick={() => startMovement('return')}>
                Kembali
              </button>
            ) : null}
            {canEarlyCheckout ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => startMovement('early-checkout')}
              >
                Pulang Lebih Awal
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {movement !== null ? (
        <section className="card space-y-3" aria-label={`Catat ${MOVEMENT_LABELS[movement]}`}>
          <h2 className="text-sm font-semibold text-slate-800">
            Catat {MOVEMENT_LABELS[movement]}
          </h2>
          {actionError ? (
            <p className="text-sm text-red-600" role="alert">{actionError}</p>
          ) : null}
          <CameraCapture
            onCaptured={(blob, previewUrl) => setPhoto({ blob, previewUrl })}
            uploadState={uploadState}
            uploadErrorMessage={submitter.error?.message}
            onRetake={() => setPhoto(null)}
          />
          <LocationStatus
            state={geolocation.state}
            fix={geolocation.fix}
            onRetry={() => void geolocation.acquire().then(setLocation)}
          />
          {photo && location ? (
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary flex-1"
                onClick={() => setMovement(null)}
                disabled={submitter.phase === 'submitting'}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn-primary flex-1"
                onClick={() => void submitMovement()}
                disabled={submitter.phase === 'submitting'}
              >
                {submitter.phase === 'failed' ? 'Kirim Ulang' : `Kirim ${MOVEMENT_LABELS[movement]}`}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {canCancel ? (
        <button type="button" className="btn-danger w-full" onClick={() => setCancelOpen(true)}>
          Batalkan Pengajuan
        </button>
      ) : null}

      <ConfirmDialog
        open={cancelOpen}
        title="Batalkan pengajuan izin?"
        description="Pengajuan yang dibatalkan tidak dapat dikembalikan."
        confirmLabel="Ya, Batalkan"
        danger
        onClose={() => setCancelOpen(false)}
        onConfirm={() =>
          cancelMutation().catch((error: unknown) => {
            setCancelOpen(false);
            setActionError(
              error instanceof ApiError ? error.message : 'Gagal membatalkan izin. Coba lagi.',
            );
          })
        }
      />

      <Link to="/izin" className="btn-secondary w-full">
        Kembali ke Daftar Izin
      </Link>
    </div>
  );
}
