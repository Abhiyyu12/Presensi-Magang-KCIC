import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatTimeWib, formatDateWib, formatWib, formatMeters, leaveStatusLabel } from '../lib/format';
import type { TodayResponse } from '../lib/types';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { MapsLink } from '../components/MapsLink';

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
  const checkIn = events.find((e) => e.eventType === 'CHECK_IN');
  const checkOut = events.find((e) => e.eventType === 'CHECK_OUT');
  const workday = today.workday;
  const isWorkingDay = Boolean(workday?.isWorkingDay);
  const lastEvent = events[events.length - 1];
  const nowHHmm = formatTimeWib(today.serverTime);
  const endHHmm = (workday?.endTime ?? '').slice(0, 5);
  const overdueCheckout = Boolean(checkIn && !checkOut && isWorkingDay && endHHmm && nowHHmm > endHHmm);

  const summary = !isWorkingDay
    ? 'Hari ini bukan hari kerja terjadwal.'
    : !checkIn
      ? 'Anda belum absen masuk hari ini.'
      : !checkOut
        ? `Sudah absen masuk pukul ${formatTimeWib(checkIn.occurredAtServer)} WIB. Jangan lupa absen pulang.`
        : `Absensi lengkap: masuk ${formatTimeWib(checkIn.occurredAtServer)}, pulang ${formatTimeWib(checkOut.occurredAtServer)} WIB.`;

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

      <section className="card space-y-3" aria-labelledby="today-heading">
        <div className="flex items-center justify-between gap-2">
          <h2 id="today-heading" className="text-sm font-semibold text-slate-800">
            Absensi hari ini
          </h2>
          <StatusBadge status={day?.dayStatus ?? (isWorkingDay ? 'SCHEDULED' : 'NOT_SCHEDULED')} />
        </div>
        <p className="text-sm text-slate-700">{summary}</p>

        {isWorkingDay ? (
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-slate-500">Jam masuk</dt>
              <dd className="font-medium text-slate-800">{formatTimeWib(workday?.startTime)} WIB</dd>
            </div>
            <div>
              <dt className="text-slate-500">Jam pulang</dt>
              <dd className="font-medium text-slate-800">{formatTimeWib(workday?.endTime)} WIB</dd>
            </div>
            {checkIn ? (
              <div>
                <dt className="text-slate-500">Absen masuk</dt>
                <dd className="font-medium text-slate-800">{formatTimeWib(checkIn.occurredAtServer)} WIB</dd>
              </div>
            ) : null}
            {checkOut ? (
              <div>
                <dt className="text-slate-500">Absen pulang</dt>
                <dd className="font-medium text-slate-800">{formatTimeWib(checkOut.occurredAtServer)} WIB</dd>
              </div>
            ) : null}
            {lastEvent?.latitude != null && lastEvent.longitude != null ? (
              <div className="col-span-2">
                <dt className="text-slate-500">Lokasi terakhir tercatat</dt>
                <dd className="font-medium text-slate-800">
                  ±{formatMeters(lastEvent.accuracyMeters)} dari titik absen ·{' '}
                  <MapsLink latitude={lastEvent.latitude} longitude={lastEvent.longitude} />
                </dd>
                {lastEvent.address ? (
                  <dd className="mt-1 text-xs text-slate-600">Alamat: {lastEvent.address}</dd>
                ) : null}
              </div>
            ) : null}
          </dl>
        ) : (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            Tidak ada jadwal kerja hari ini, jadi tombol absen dinonaktifkan. Jika menurut Anda ini
            keliru, hubungi admin HR.
          </p>
        )}

        {day?.correctionFlag ? (
          <p className="rounded-lg bg-amber-50 p-2 text-xs font-medium text-amber-800">
            Ada koreksi pada catatan hari ini oleh admin.
          </p>
        ) : null}

        {overdueCheckout ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
            Anda belum absen pulang. Jam pulang jadwal ({endHHmm} WIB) sudah lewat — segera absen
            pulang bila masih di lokasi kerja.
          </p>
        ) : null}

        {isWorkingDay && !checkIn ? (
          <Link to="/absensi?action=check-in" className="btn-primary w-full min-h-[56px] text-base">
            Absen Masuk
          </Link>
        ) : isWorkingDay && checkIn && !checkOut ? (
          <Link to="/absensi?action=check-out" className="btn-primary w-full min-h-[56px] text-base">
            Absen Pulang
          </Link>
        ) : isWorkingDay ? (
          <Link to="/riwayat" className="btn-secondary w-full">
            Lihat Riwayat Hari Ini
          </Link>
        ) : (
          <button type="button" className="btn-primary w-full min-h-[56px] text-base" disabled>
            Absen tidak tersedia hari ini
          </button>
        )}
        {isWorkingDay && !checkIn ? (
          <p className="text-xs text-slate-500">
            Absen pulang terbuka setelah absen masuk berhasil. Waktu resmi memakai waktu server.
          </p>
        ) : null}
      </section>

      {today.activeLeave ? (
        <section className="card border-brand-200 bg-brand-50" aria-labelledby="leave-heading">
          <h2 id="leave-heading" className="text-sm font-semibold text-brand-900">
            Izin aktif
          </h2>
          <p className="mt-1 text-sm text-brand-800">
            {today.activeLeave.leaveType === 'TEMPORARY'
              ? 'Izin sementara (akan kembali)'
              : 'Pulang lebih awal'}{' '}
            · Status: <StatusBadge kind="leaveStatus" status={today.activeLeave.status} />
          </p>
          {today.activeLeave.status === 'PENDING' ? (
            <p className="mt-1 text-sm text-brand-800">Pengajuan izin menunggu persetujuan.</p>
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
        <h2 className="text-sm font-semibold text-slate-800">Menu cepat</h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Link to="/riwayat" className="btn-secondary px-2 py-2 text-xs">
            Riwayat
          </Link>
          <Link to="/izin" className="btn-secondary px-2 py-2 text-xs">
            Izin
          </Link>
          <Link to="/bantuan" className="btn-secondary px-2 py-2 text-xs">
            Bantuan
          </Link>
        </div>
      </section>
    </div>
  );
}