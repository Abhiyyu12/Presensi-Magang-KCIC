import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { isRecord } from '../lib/types';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';

function pickNumber(source: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number') return value;
    if (isRecord(value)) {
      const inner = value['count'] ?? value['total'];
      if (typeof inner === 'number') return inner;
    }
  }
  return undefined;
}

export default function AdminDashboardPage() {
  const dashQuery = useQuery({
    queryKey: ['dashboard', 'admin'],
    queryFn: () => api<unknown>('/dashboard/admin'),
  });

  if (dashQuery.isLoading) return <LoadingState label="Memuat dashboard admin…" />;
  if (dashQuery.isError) {
    return (
      <ErrorState
        message={dashQuery.error instanceof Error ? dashQuery.error.message : 'Gagal memuat.'}
        onRetry={() => void dashQuery.refetch()}
      />
    );
  }

  const raw = isRecord(dashQuery.data) ? dashQuery.data : {};
  const metrics = isRecord(raw['metrics']) ? raw['metrics'] : raw;

  const cards: { label: string; value: number | undefined; to?: string }[] = [
    { label: 'Izin menunggu approval', value: pickNumber(raw, 'pendingLeaveCount', 'pendingLeaves', 'pendingApprovals'), to: '/approval' },
    { label: 'Perlu review', value: pickNumber(metrics, 'perluReview', 'needsReviewCount', 'needsReview'), to: '/monitoring' },
    { label: 'Terjadwal hari ini', value: pickNumber(metrics, 'terjadwal', 'scheduledCount') },
    { label: 'Hadir hari ini', value: pickNumber(metrics, 'hadir', 'presentCount') },
    { label: 'Terlambat hari ini', value: pickNumber(metrics, 'terlambat', 'lateCount') },
    { label: 'Koreksi hari ini', value: pickNumber(metrics, 'koreksi', 'correctionCount') },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-bold text-slate-900">Dashboard Admin</h1>
        <p className="text-sm text-slate-600">Ringkasan operasional hari ini (dihitung server).</p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((card) => (
          <div key={card.label} className="card">
            <p className="text-2xl font-bold text-slate-900">
              {card.value !== undefined ? card.value : '-'}
            </p>
            <p className="mt-1 text-xs text-slate-500">{card.label}</p>
            {card.to ? (
              <Link to={card.to} className="mt-2 inline-block text-xs font-semibold text-brand-700 hover:underline">
                Buka
              </Link>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link to="/monitoring" className="btn-primary">Monitoring Absensi</Link>
        <Link to="/approval" className="btn-secondary">Approval Izin</Link>
        <Link to="/reports" className="btn-secondary">Report & Statistik</Link>
        <Link to="/master" className="btn-secondary">Data Master</Link>
      </div>
    </div>
  );
}
