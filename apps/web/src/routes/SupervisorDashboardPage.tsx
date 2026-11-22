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
  todayStatus?: { name: string; dayStatus: string }[];
}

function parseDashboard(raw: unknown): DashboardData {
  if (!isRecord(raw)) return {};
  const num = (key: string): number | undefined => {
    const value = raw[key];
    if (typeof value === 'number') return value;
    if (isRecord(value) && typeof value['count'] === 'number') return value['count'];
    if (isRecord(value) && typeof value['total'] === 'number') return value['total'];
    return undefined;
  };
  const todayRaw = raw['todayStatus'] ?? raw['today'] ?? raw['participants'];
  const todayStatus = Array.isArray(todayRaw)
    ? todayRaw
        .filter(isRecord)
        .slice(0, 25)
        .map((row) => ({
          name: asString(row['participantName'] ?? row['name']),
          dayStatus: asString(row['dayStatus'] ?? row['status'], 'SCHEDULED'),
        }))
    : undefined;
  return {
    assignedCount: num('assignedCount') ?? num('assignedInterns'),
    checkedInCount: num('checkedInCount') ?? num('checkedIn'),
    notCheckedInCount: num('notCheckedInCount') ?? num('notCheckedIn'),
    needsReviewCount: num('needsReviewCount') ?? num('needsReview'),
    pendingLeaveCount: num('pendingLeaveCount') ?? num('pendingLeaves'),
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
    { label: 'Sudah check-in hari ini', value: data.checkedInCount },
    { label: 'Belum check-in hari ini', value: data.notCheckedInCount },
    { label: 'Perlu review', value: data.needsReviewCount },
    { label: 'Izin menunggu', value: data.pendingLeaveCount },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-bold text-slate-900">Dashboard Pembimbing</h1>
        <p className="text-sm text-slate-600">
          Ringkasan peserta binaan Anda hari ini (data dari server, sesuai cakupan).
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

      {data.todayStatus && data.todayStatus.length > 0 ? (
        <section className="card" aria-labelledby="today-list">
          <h2 id="today-list" className="text-sm font-semibold text-slate-800">
            Status peserta hari ini
          </h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {data.todayStatus.map((row, index) => (
              <li key={`${row.name}-${index}`} className="flex items-center justify-between gap-2 py-2">
                <span className="truncate text-sm text-slate-700">{row.name}</span>
                <StatusBadge status={row.dayStatus} />
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
