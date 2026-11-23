import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { isRecord, asString } from '../lib/types';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { StatusBadge } from '../components/StatusBadge';

interface DashboardData {
  assignedCount?: number;
  checkedInCount?: number;
  notCheckedInCount?: number;
  needsReviewCount?: number;
  pendingLeaveCount?: number;
  todayStatus: { name: string; dayStatus: string }[];
}

function parseDashboard(raw: unknown): DashboardData {
  if (!isRecord(raw)) return { todayStatus: [] };
  const assigned = isRecord(raw['assignedInterns']) ? raw['assignedInterns'] : {};
  const stats = isRecord(raw['todayStats']) ? raw['todayStats'] : {};
  const num = (v: unknown): number | undefined => (typeof v === 'number' ? v : undefined);
  const todayStatus = Array.isArray(raw['todayStatus'])
    ? raw['todayStatus']
        .filter(isRecord)
        .slice(0, 25)
        .map((row) => ({
          name: asString(row['name']),
          dayStatus: asString(row['dayStatus'], ''),
        }))
    : [];
  return {
    assignedCount: num(assigned['count']),
    checkedInCount: num(stats['checkedIn']),
    notCheckedInCount: num(stats['notCheckedIn']),
    needsReviewCount: num(stats['needsReview']),
    pendingLeaveCount: num(stats['pendingLeaves']),
    todayStatus,
  };
}

export default function SupervisorDashboardPage() {
  const dashQuery = useQuery({
    queryKey: ['dashboard', 'supervisor'],
    queryFn: () => api<unknown>('/dashboard/supervisor'),
  });

  if (dashQuery.isLoading) return <LoadingState label="Memuat dashboard…" />;
  if (dashQuery.isError) {
    return (
      <ErrorState
        message={dashQuery.error instanceof Error ? dashQuery.error.message : 'Gagal memuat.'}
        onRetry={() => void dashQuery.refetch()}
      />
    );
  }

  const data = parseDashboard(dashQuery.data);

  const cards: { label: string; value: number | undefined }[] = [
    { label: 'Peserta bimbingan', value: data.assignedCount },
    { label: 'Sudah absen masuk', value: data.checkedInCount },
    { label: 'Belum absen masuk', value: data.notCheckedInCount },
    { label: 'Perlu review', value: data.needsReviewCount },
    { label: 'Izin menunggu', value: data.pendingLeaveCount },
  ];

  return (
    <div className="stagger space-y-4">
      <header>
        <h1 className="text-lg font-bold text-slate-900">Beranda Pembimbing</h1>
        <p className="text-sm text-slate-600">
          Ringkasan peserta binaan Anda hari ini.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((card) => (
          <div key={card.label} className="card">
            <p className="text-2xl font-bold text-slate-900">
              {card.value !== undefined ? card.value : '-'}
            </p>
            <p className="mt-1 text-xs text-slate-500">{card.label}</p>
          </div>
        ))}
      </div>

      {data.todayStatus.length > 0 ? (
        <section className="card" aria-labelledby="today-list">
          <h2 id="today-list" className="text-sm font-semibold text-slate-800">
            Status peserta hari ini
          </h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {data.todayStatus.map((row, index) => (
              <li key={`${row.name}-${index}`} className="flex items-center justify-between gap-2 py-2">
                <span className="truncate text-sm text-slate-700">{row.name}</span>
                {row.dayStatus ? <StatusBadge status={row.dayStatus} /> : <span className="text-xs text-slate-400">-</span>}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Link to="/monitoring" className="btn-primary">
          Monitoring Absensi
        </Link>
        <Link to="/reports" className="btn-secondary">
          Report & Statistik
        </Link>
      </div>
    </div>
  );
}
