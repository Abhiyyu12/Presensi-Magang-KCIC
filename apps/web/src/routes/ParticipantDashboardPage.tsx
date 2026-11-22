import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatTimeWib, formatDateWib, formatWib, dayStatusLabel, leaveStatusLabel } from '../lib/format';
import type { TodayResponse } from '../lib/types';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';

export default function ParticipantDashboardPage() {
  const { user } = useAuth();
  const todayQuery = useQuery({
    queryKey: ['attendance', 'today'],
    queryFn: () => api<TodayResponse>('/attendance/today'),
  });

  if (todayQuery.isLoading) return <LoadingState label="Memuat status hari ini…" />;
  if (todayQuery.isError) {
    return (
      <ErrorState
        message={todayQuery.error instanceof Error ? todayQuery.error.message : 'Gagal memuat.'}
        onRetry={() => void todayQuery.refetch()}
      />
    );
  }

  const today = todayQuery.data;
  if (!today) return <LoadingState label="Memuat status hari ini…" />;
  const day = today.attendanceDay;
  const events = day?.events ?? [];
  const hasCheckIn = events.some((e) => e.eventType === 'CHECK_IN');
  const hasCheckOut = events.some((e) => e.eventType === 'CHECK_OUT');
  const workday = today.workday;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-bold text-slate-900">
          Halo, {user?.displayName ?? user?.username}
        </h1>
        <p className="text-sm text-slate-600">
          {formatDateWib(today.workDate)} · Waktu server: {formatWib(today.serverTime)}
        </p>
      </header>

      <section className="card" aria-labelledby="schedule-heading">
        <h2 id="schedule-heading" className="text-sm font-semibold text-slate-800">
          Jadwal hari ini
        </h2>
        {workday && workday.isWorkingDay ? (
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-slate-500">Jam masuk</dt>
              <dd className="font-medium text-slate-800">{formatTimeWib(workday.startTime)} WIB</dd>
            </div>
            <div>
              <dt className="text-slate-500">Jam pulang</dt>
              <dd className="font-medium text-slate-800">{formatTimeWib(workday.endTime)} WIB</dd>
            </div>
            <div>
              <dt className="text-slate-500">Toleransi keterlambatan</dt>
              <dd className="font-medium text-slate-800">
                {workday.lateToleranceMinutes ?? 0} menit
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Status hari</dt>
              <dd>
                <StatusBadge status={day?.dayStatus ?? 'SCHEDULED'} />
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-2 text-sm text-slate-600">
            Hari ini tidak terjadwal ({dayStatusLabel(day?.dayStatus ?? 'NOT_SCHEDULED')}).
          </p>
        )}
      </section>

      <section className="card" aria-labelledby="attendance-heading">
        <h2 id="attendance-heading" className="text-sm font-semibold text-slate-800">
          Absensi hari ini
        </h2>
        {day ? (
          <div className="mt-2 space-y-2">
            <p className="text-sm text-slate-600">
              Status saat ini: <StatusBadge status={day.dayStatus} />
              {day.correctionFlag ? (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                  Ada koreksi
                </span>
              ) : null}
            </p>
            {events.length > 0 ? (
              <ul className="space-y-1 text-sm text-slate-700">
                {events.map((event) => (
                  <li key={event.id} className="flex items-center justify-between gap-2">
                    <span>{event.eventType === 'CHECK_IN' ? 'Check-in' : 'Check-out'}</span>
                    <span className="font-medium">{formatWib(event.occurredAtServer)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Belum ada event absensi hari ini.</p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Belum ada catatan absensi hari ini.</p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link
            to="/absensi?action=check-in"
            aria-disabled={hasCheckIn}
            className={`btn ${hasCheckIn ? 'pointer-events-none opacity-40' : 'btn-primary'}`}
          >
            Check-in
          </Link>
          <Link
            to="/absensi?action=check-out"
            aria-disabled={!hasCheckIn || hasCheckOut}
            className={`btn ${
              hasCheckIn && !hasCheckOut ? 'btn-primary' : 'pointer-events-none opacity-40'
            }`}
          >
            Check-out
          </Link>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Hanya aksi berikutnya yang valid yang dapat dilakukan. Status akhir ditentukan server.
        </p>
      </section>

      {today.activeLeave ? (
        <section className="card border-sky-200 bg-sky-50" aria-labelledby="leave-heading">
          <h2 id="leave-heading" className="text-sm font-semibold text-sky-900">
            Izin aktif
          </h2>
          <p className="mt-1 text-sm text-sky-800">
            {today.activeLeave.leaveType === 'TEMPORARY'
              ? 'Izin sementara (akan kembali)'
              : 'Pulang lebih awal'}{' '}
            · Status: <StatusBadge kind="leaveStatus" status={today.activeLeave.status} />
          </p>
          {today.activeLeave.status === 'PENDING' ? (
            <p className="mt-1 text-sm text-sky-800">Pengajuan izin menunggu persetujuan.</p>
          ) : null}
          <Link
            to={`/izin/${today.activeLeave.id}`}
            className="btn-secondary mt-3 px-3 py-1.5 text-xs"
          >
            Lihat detail izin ({leaveStatusLabel(today.activeLeave.status)})
          </Link>
        </section>
      ) : null}

      <section className="card">
        <h2 className="text-sm font-semibold text-slate-800">Butuh bantuan?</h2>
        <p className="mt-1 text-sm text-slate-600">
          Pelajari cara absensi dengan kamera dan lokasi, atau aturan izin tengah hari.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/bantuan" className="btn-secondary px-3 py-1.5 text-xs">
            Pusat Bantuan
          </Link>
          <Link to="/riwayat" className="btn-secondary px-3 py-1.5 text-xs">
            Riwayat Absensi
          </Link>
        </div>
      </section>
    </div>
  );
}
