import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  EVENT_TYPE_LABELS,
  formatDateWib,
  formatMeters,
  formatTimeWib,
  formatWib,
  fromDatetimeLocalWib,
} from '../lib/format';
import type { AttendanceDay } from '../lib/types';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { EvidenceImage } from '../components/EvidenceImage';
import { FormField } from '../components/FormField';
import { MapsLink } from '../components/MapsLink';

const correctionSchema = z.object({
  correctedOccurredAt: z.string().min(1, 'Waktu koreksi wajib diisi.'),
  reason: z.string().min(5, 'Alasan koreksi minimal 5 karakter.'),
});
type CorrectionForm = z.infer<typeof correctionSchema>;

interface AttendanceDetailPageProps {
  /** 'own' = participant history (evidence always allowed for own record). */
  mode: 'own' | 'monitoring';
}

export default function AttendanceDetailPage({ mode }: AttendanceDetailPageProps) {
  const { attendanceId } = useParams<{ attendanceId: string }>();
  const { has } = useAuth();
  const queryClient = useQueryClient();
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [correctionDone, setCorrectionDone] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['attendance', 'detail', attendanceId],
    queryFn: () => api<AttendanceDay>(`/attendance/${attendanceId}`),
    enabled: Boolean(attendanceId),
  });

  const form = useForm<CorrectionForm>({ resolver: zodResolver(correctionSchema) });

  const correctionMutation = useMutation({
    mutationFn: (values: CorrectionForm) => {
      const iso = fromDatetimeLocalWib(values.correctedOccurredAt);
      if (!iso) throw new ApiError('VALIDATION', 'Format waktu koreksi tidak valid.', 400);
      return api<unknown>(`/admin/attendance/${attendanceId}/correction`, {
        method: 'POST',
        body: { correctedOccurredAt: iso, reason: values.reason },
      });
    },
    onSuccess: () => {
      setCorrectionError(null);
      setCorrectionDone(true);
      form.reset();
      void queryClient.invalidateQueries({ queryKey: ['attendance', 'detail', attendanceId] });
    },
    onError: (error: unknown) => {
      setCorrectionError(error instanceof ApiError ? error.message : 'Gagal menyimpan koreksi.');
    },
  });

  if (detailQuery.isLoading) return <LoadingState label="Memuat detail absensi…" />;
  if (detailQuery.isError || !detailQuery.data) {
    return (
      <ErrorState
        message={detailQuery.error instanceof Error ? detailQuery.error.message : 'Gagal memuat.'}
        onRetry={() => void detailQuery.refetch()}
      />
    );
  }

  const day = detailQuery.data;
  const canViewEvidence = mode === 'own' || has('attendance:view:scoped');
  const canCorrect = mode === 'monitoring' && has('attendance:correct');
  const snapshot = day.scheduleSnapshot;
  const checkIn = day.events.find((e) => e.eventType === 'CHECK_IN');

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-lg font-bold text-slate-900">Detail Absensi</h1>
        <p className="text-sm text-slate-600">
          {day.participantName ? `${day.participantName} · ` : ''}
          {formatDateWib(day.workDate)} · <StatusBadge status={day.dayStatus} />
          {day.correctionFlag ? (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
              Ada koreksi
            </span>
          ) : null}
        </p>
        {day.bureau || day.division ? (
          <p className="text-xs text-slate-500">
            {[day.bureau, day.division].filter(Boolean).join(' · ')}
          </p>
        ) : null}
      </header>

      {snapshot ? (
        <section className="card text-sm" aria-labelledby="snapshot-heading">
          <h2 id="snapshot-heading" className="font-semibold text-slate-800">
            Jadwal (snapshot server)
          </h2>
          <p className="mt-1 text-slate-600">
            {snapshot.isWorkingDay
              ? `${formatTimeWib(snapshot.startTime)}–${formatTimeWib(snapshot.endTime)} WIB · toleransi ${snapshot.lateToleranceMinutes != null ? `${snapshot.lateToleranceMinutes} menit` : 'tidak tercatat'}`
              : 'Tidak terjadwal'}
          </p>
        </section>
      ) : null}

      <section className="card" aria-labelledby="events-heading">
        <h2 id="events-heading" className="text-sm font-semibold text-slate-800">
          Timeline event
        </h2>
        {day.events.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            Tidak ada event. {checkIn ? '' : 'Peserta terjadwal tetap tercatat meski tanpa event.'}
          </p>
        ) : (
          <ol className="mt-3 space-y-4 border-l-2 border-slate-200 pl-4">
            {day.events.map((event) => (
              <li key={event.id} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-brand-600"
                />
                <p className="text-sm font-medium text-slate-800">
                  {EVENT_TYPE_LABELS[event.eventType] ?? event.eventType}
                  {event.isLate ? (
                    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                      Terlambat (server)
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-slate-500">Waktu server: {formatWib(event.occurredAtServer)}</p>
                {event.latitude != null && event.longitude != null ? (
                  <p className="text-xs text-slate-500">
                    Lokasi tercatat · akurasi ±{formatMeters(event.accuracyMeters)} ·{' '}
                    <MapsLink latitude={event.latitude} longitude={event.longitude} />
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">Lokasi tidak tercatat pada event ini.</p>
                )}
                {canViewEvidence && event.evidenceId ? (
                  <div className="mt-2">
                    <EvidenceImage
                      attendanceId={day.id}
                      eventId={event.id}
                      alt={`Bukti selfie ${EVENT_TYPE_LABELS[event.eventType] ?? event.eventType}`}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      {canCorrect ? (
        <section className="card" aria-labelledby="correction-heading">
          <h2 id="correction-heading" className="text-sm font-semibold text-slate-800">
            Koreksi absensi
          </h2>
          {checkIn ? (
            <p className="mt-1 text-xs text-slate-500">
              Nilai saat ini (absen masuk): {formatWib(checkIn.occurredAtServer)}
            </p>
          ) : null}
          {correctionDone ? (
            <p className="mt-2 rounded-lg bg-green-50 p-2 text-sm text-green-700" role="status">
              Koreksi berhasil disimpan. Nilai sebelum/sesudah tercatat pada audit.
            </p>
          ) : null}
          {correctionError ? (
            <p className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">
              {correctionError}
            </p>
          ) : null}
          <form
            className="mt-3 space-y-3"
            onSubmit={form.handleSubmit((values) => correctionMutation.mutate(values))}
            noValidate
          >
            <FormField
              label="Waktu terkoreksi"
              required
              hint="Nilai resmi tetap divalidasi server; koreksi diaudit."
              error={form.formState.errors.correctedOccurredAt?.message}
            >
              {(props) => (
                <input
                  {...props}
                  {...form.register('correctedOccurredAt')}
                  type="datetime-local"
                  className="input"
                />
              )}
            </FormField>
            <FormField
              label="Alasan koreksi"
              required
              error={form.formState.errors.reason?.message}
            >
              {(props) => (
                <textarea
                  {...props}
                  {...form.register('reason')}
                  className="input"
                  rows={2}
                  maxLength={500}
                />
              )}
            </FormField>
            <button
              type="submit"
              className="btn-primary w-full"
              disabled={correctionMutation.isPending}
            >
              {correctionMutation.isPending ? 'Menyimpan…' : 'Simpan Koreksi'}
            </button>
          </form>
        </section>
      ) : null}

      <Link to={mode === 'own' ? '/riwayat' : '/monitoring'} className="btn-secondary w-full">
        Kembali
      </Link>
    </div>
  );
}
