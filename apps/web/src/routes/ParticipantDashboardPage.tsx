import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatTimeWib, formatDateWib, formatWib, formatMeters, leaveStatusLabel } from '../lib/format';
import type { AttendanceDay, Paginated, Profile, TodayResponse } from '../lib/types';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { MapsLink } from '../components/MapsLink';

const INTERN_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Aktif',
  COMPLETED: 'Selesai',
  WITHDRAWN: 'Mundur',
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-slate-100 py-1.5 last:border-b-0">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'warn' | 'info' }) {
  const tones: Record<'ok' | 'warn' | 'info', string> = {
    ok: 'bg-emerald-50 text-emerald-800',
    warn: 'bg-amber-50 text-amber-800',
    info: 'bg-slate-100 text-slate-700',
  };
  return (
    <div className={`rounded-lg p-2 text-center ${tones[tone]}`}>
      <dt className="text-xs">{label}</dt>
      <dd className="text-lg font-bold">{value}</dd>
    </div>
  );
}

/** Rentang bulan kalender dari tanggal bisnis server (YYYY-MM-DD), aman zona waktu. */
function monthRange(workDate: string): { startDate: string; endDateExclusive: string; label: string } {
  const year = Number(workDate.slice(0, 4));
  const month = Number(workDate.slice(5, 7));
  const firstOfNext = new Date(Date.UTC(year, month, 1));
  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return {
    startDate: `${workDate.slice(0, 8)}01`,
    endDateExclusive: firstOfNext.toISOString().slice(0, 10),
    label,
  };
}

export default function ParticipantDashboardPage() {
  const { user } = useAuth();
  const todayQuery = useQuery({
    queryKey: ['attendance', 'today'],
    queryFn: () => api<TodayResponse>('/attendance/today'),
  });
  const today = todayQuery.data;
  const month = today ? monthRange(today.workDate) : null;

  const profileQuery = useQuery({
    queryKey: ['profile'],
    queryFn: () => api<{ user: Profile | null }>('/profile'),
    staleTime: 5 * 60_000,
  });

  const monthQuery = useQuery({
    queryKey: ['attendance', 'summary', month?.startDate ?? ''],
    queryFn: () =>
      api<Paginated<AttendanceDay>>('/attendance', {
        query: {
          page: 1,
          pageSize: 100,
          startDate: month!.startDate,
          endDateExclusive: month!.endDateExclusive,
        },
      }),
    enabled: Boolean(month),
    staleTime: 60_000,
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

  const intern = profileQuery.data?.user?.internProfile ?? null;
  const supervisorNames = intern?.supervisors.map((s) => s.displayName).join(', ');

  const monthItems = monthQuery.data?.items ?? [];
  const countStatus = (status: string) => monthItems.filter((d) => d.dayStatus === status).length;
  const hadirCount = countStatus('PRESENT') + countStatus('EARLY_DEPARTURE_APPROVED');
  const scheduledCount = monthItems.filter((d) => d.dayStatus !== 'NOT_SCHEDULED').length;
  const belumAbsenCount = countStatus('SCHEDULED');

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-bold text-slate-900">
          Halo, {user?.displayName ?? user?.username}
        </h1>
        <p className="text-sm text-slate-600">{formatDateWib(today.workDate)}</p>
      </header>

      <section className="card" aria-labelledby="identity-heading">
        <h2 id="identity-heading" className="text-sm font-semibold text-slate-800">
          Data peserta
        </h2>
        {profileQuery.isLoading ? (
          <p className="mt-2 text-sm text-slate-500">Memuat data peserta…</p>
        ) : profileQuery.isError || !intern ? (
          <p className="mt-2 text-sm text-slate-500">
            Data peserta tidak dapat dimuat. Coba muat ulang halaman.
          </p>
        ) : (
          <dl className="mt-1 text-sm">
            <DetailRow label="Nomor peserta" value={intern.participantNumber} />
            <DetailRow label="Biro" value={intern.bureauName ?? '-'} />
            <DetailRow label="Divisi" value={intern.divisionName ?? '-'} />
            <DetailRow label="Penempatan" value={intern.placementName ?? '-'} />
            <DetailRow label="Pembimbing" value={supervisorNames && supervisorNames.length > 0 ? supervisorNames : '-'} />
            <DetailRow
              label="Periode magang"
              value={`${formatDateWib(intern.startDate)} s.d. ${intern.endDate ? formatDateWib(intern.endDate) : '-'}`}
            />
            <DetailRow label="Status peserta" value={INTERN_STATUS_LABEL[intern.status] ?? intern.status} />
          </dl>
        )}
      </section>

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
              <dt className="text-slate-500">Jam masuk jadwal</dt>
              <dd className="font-medium text-slate-800">{formatTimeWib(workday?.startTime)} WIB</dd>
            </div>
            <div>
              <dt className="text-slate-500">Jam pulang jadwal</dt>
              <dd className="font-medium text-slate-800">{formatTimeWib(workday?.endTime)} WIB</dd>
            </div>
            {workday?.lateToleranceMinutes != null ? (
              <div>
                <dt className="text-slate-500">Toleransi terlambat</dt>
                <dd className="font-medium text-slate-800">{workday.lateToleranceMinutes} menit</dd>
              </div>
            ) : null}
            {checkIn ? (
              <div>
                <dt className="text-slate-500">Absen masuk</dt>
                <dd className="font-medium text-slate-800">
                  {formatTimeWib(checkIn.occurredAtServer)} WIB
                  {checkIn.isLate ? (
                    <span className="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-xs font-semibold text-red-700">
                      Terlambat
                    </span>
                  ) : null}
                </dd>
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
          {today.activeLeave.estimatedDepartureAt ? (
            <p className="mt-1 text-sm text-brand-800">
              Estimasi keluar: {formatWib(today.activeLeave.estimatedDepartureAt)}
              {today.activeLeave.estimatedReturnAt
                ? ` · Estimasi kembali: ${formatWib(today.activeLeave.estimatedReturnAt)}`
                : ''}
            </p>
          ) : null}
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

      <section className="card" aria-labelledby="summary-heading">
        <div className="flex items-center justify-between gap-2">
          <h2 id="summary-heading" className="text-sm font-semibold text-slate-800">
            Kehadiran bulan ini
          </h2>
          <span className="text-xs text-slate-500">{month?.label}</span>
        </div>
        {monthQuery.isLoading ? (
          <p className="mt-2 text-sm text-slate-500">Memuat ringkasan…</p>
        ) : monthQuery.isError ? (
          <p className="mt-2 text-sm text-slate-500">Ringkasan tidak dapat dimuat.</p>
        ) : (
          <>
            <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatTile label="Hadir" value={hadirCount} tone="ok" />
              <StatTile label="Terlambat" value={countStatus('LATE')} tone="warn" />
              <StatTile label="Belum lengkap" value={countStatus('INCOMPLETE')} tone="warn" />
              <StatTile label="Perlu review" value={countStatus('NEEDS_REVIEW')} tone="info" />
            </dl>
            <p className="mt-2 text-xs text-slate-500">
              Dari {scheduledCount} hari kerja terjadwal bulan ini · {belumAbsenCount} hari belum
              ada absen sama sekali.
            </p>
            <Link to="/riwayat" className="btn-secondary mt-3 px-3 py-1.5 text-xs">
              Lihat riwayat lengkap
            </Link>
          </>
        )}
      </section>

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
