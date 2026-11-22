import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { isRecord } from '../lib/types';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';

export default function AdminDashboardPage() {
  const { has } = useAuth();
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
  const counts = isRecord(raw['counts']) ? raw['counts'] : {};
  const num = (key: string): number | undefined =>
    typeof counts[key] === 'number' ? (counts[key] as number) : undefined;

  const canMonitoring = has('attendance:view:scoped') || has('report:view');
  const canApproval = has('leave:approve');
  const canReports = has('report:view');
  const canMaster = [
    'admin:users:manage',
    'admin:org:manage',
    'admin:placements:manage',
    'admin:assignments:manage',
    'admin:schedules:manage',
    'admin:calendar:manage',
    'admin:leave-categories:manage',
    'admin:params:manage',
  ].some(has);

  const cards: { label: string; value: number | undefined; to?: string }[] = [
    { label: 'Izin menunggu approval', value: num('pendingLeaves'), to: canApproval ? '/approval' : undefined },
    { label: 'Perlu review', value: num('needsReview'), to: canMonitoring ? '/monitoring' : undefined },
    { label: 'Terjadwal hari ini', value: num('scheduled') },
    { label: 'Hadir hari ini', value: num('checkedIn') },
    { label: 'Terlambat hari ini', value: num('late') },
    { label: 'Izin belum kembali', value: num('staleLeaves'), to: canApproval ? '/approval' : undefined },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-bold text-slate-900">Beranda Admin</h1>
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
        {canMonitoring ? <Link to="/monitoring" className="btn-primary">Monitoring</Link> : null}
        {canApproval ? <Link to="/approval" className="btn-secondary">Approval</Link> : null}
        {canReports ? <Link to="/reports" className="btn-secondary">Laporan</Link> : null}
        {canMaster ? <Link to="/master" className="btn-secondary">Data Master</Link> : null}
        {has('access:roles:manage') ? <Link to="/access" className="btn-secondary">Akses</Link> : null}
        {has('admin:audit:view') ? <Link to="/audit" className="btn-secondary">Audit</Link> : null}
      </div>
    </div>
  );
}
