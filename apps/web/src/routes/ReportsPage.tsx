import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, API_BASE, buildQuery } from '../lib/api';
import { DAY_STATUS_LABELS, formatDateWib, formatTimeWib, nextDay, todayWibDateString } from '../lib/format';
import type { NamedEntity, Paginated, ReportMetrics, ReportRow } from '../lib/types';
import { DataTable, type Column } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { ErrorState } from '../components/ErrorState';
import { ServerPagination } from '../components/ServerPagination';
import { FormField } from '../components/FormField';
import { usePagedFilters, useMemoizedObject } from '../hooks/useUiHelpers';

interface ReportFilters {
  startDate: string;
  endDate: string;
  bureauId: string;
  divisionId: string;
  dayStatus: string;
}

const METRIC_LABELS: { key: keyof ReportMetrics; label: string }[] = [
  { key: 'terjadwal', label: 'Terjadwal' },
  { key: 'hadir', label: 'Hadir' },
  { key: 'tepatWaktu', label: 'Tepat Waktu' },
  { key: 'terlambat', label: 'Terlambat' },
  { key: 'lengkap', label: 'Lengkap' },
  { key: 'belumLengkap', label: 'Belum Lengkap' },
  { key: 'tidakAdaCatatan', label: 'Tidak Ada Catatan' },
  { key: 'izinPending', label: 'Izin Pending' },
  { key: 'sedangIzin', label: 'Sedang Izin' },
  { key: 'sudahKembali', label: 'Sudah Kembali' },
  { key: 'perluReview', label: 'Perlu Review' },
  { key: 'pulangAwal', label: 'Pulang Awal' },
  { key: 'koreksi', label: 'Koreksi' },
];

export default function ReportsPage() {
  const today = todayWibDateString();
  const [filters, setFilters] = useState<ReportFilters>({
    startDate: today,
    endDate: nextDay(today),
    bureauId: '',
    divisionId: '',
    dayStatus: '',
  });
  const [applied, setApplied] = useState(filters);
  const queryFilters = useMemoizedObject(applied);
  const { page, setPage } = usePagedFilters(queryFilters);

  const commonQuery = {
    startDate: queryFilters.startDate,
    endDateExclusive: nextDay(queryFilters.endDate),
    bureauId: queryFilters.bureauId || undefined,
    divisionId: queryFilters.divisionId || undefined,
    dayStatus: queryFilters.dayStatus || undefined,
  };

  const reportQuery = useQuery({
    queryKey: ['reports', 'attendance', page, queryFilters],
    queryFn: () =>
      api<{ items: ReportRow[]; metrics: ReportMetrics; pagination: Paginated<never>['pagination'] }>(
        '/reports/attendance',
        { query: { ...commonQuery, page, pageSize: 15 } },
      ),
    placeholderData: (previous) => previous,
  });

  const bureausQuery = useQuery({
    queryKey: ['bureaus'],
    queryFn: () => api<Paginated<NamedEntity>>('/admin/organizations/bureaus', { query: { pageSize: 100 } }),
    retry: false,
  });
  const divisionsQuery = useQuery({
    queryKey: ['divisions'],
    queryFn: () => api<Paginated<NamedEntity>>('/admin/organizations/divisions', { query: { pageSize: 100 } }),
    retry: false,
  });

  const exportHref = (format: 'csv' | 'xlsx'): string =>
    `${API_BASE}/reports/attendance/export${buildQuery({ format, ...commonQuery })}`;

  const set = (patch: Partial<ReportFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const columns: Column<ReportRow>[] = [
    { header: 'Tanggal', cell: (row) => formatDateWib(row.workDate) },
    { header: 'No. ID', cell: (row) => row.participantNumber ?? '-' },
    { header: 'Nama', cell: (row) => row.participantName },
    { header: 'Biro', cell: (row) => row.bureau ?? '-' },
    { header: 'Divisi', cell: (row) => row.division ?? '-' },
    { header: 'Masuk', cell: (row) => formatTimeWib(row.checkIn) },
    { header: 'Pulang', cell: (row) => formatTimeWib(row.checkOut) },
    {
      header: 'Status',
      cell: (row) => (
        <span className="flex items-center gap-1">
          <StatusBadge status={row.dayStatus} />
          {row.correctionFlag ? (
            <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800">
              KOREKSI
            </span>
          ) : null}
        </span>
      ),
    },
    {
      header: 'Izin',
      cell: (row) =>
        row.leaves && row.leaves.length > 0
          ? row.leaves.map((l) => l.leaveType === 'TEMPORARY' ? 'Sementara' : 'Pulang awal').join(', ')
          : '-',
    },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Report & Statistik</h1>
          <p className="text-sm text-slate-600">
            Metrik dihitung server sesuai filter dan cakupan Anda. Denominator: terjadwal.
          </p>
        </div>
        <div className="flex gap-2">
          <a className="btn-secondary" href={exportHref('csv')} download>
            Ekspor CSV
          </a>
          <a className="btn-primary" href={exportHref('xlsx')} download>
            Ekspor XLSX
          </a>
        </div>
      </header>

      <form
        className="card grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(filters);
        }}
        aria-label="Filter laporan"
      >
        <FormField label="Tanggal mulai" required>
          {(props) => (
            <input
              {...props}
              type="date"
              className="input"
              required
              value={filters.startDate}
              onChange={(e) => set({ startDate: e.target.value })}
            />
          )}
        </FormField>
        <FormField label="Tanggal akhir" required>
          {(props) => (
            <input
              {...props}
              type="date"
              className="input"
              required
              value={filters.endDate}
              onChange={(e) => set({ endDate: e.target.value })}
            />
          )}
        </FormField>
        <FormField label="Biro">
          {(props) => (
            <select
              {...props}
              className="input"
              value={filters.bureauId}
              onChange={(e) => set({ bureauId: e.target.value })}
              disabled={bureausQuery.isError}
            >
              <option value="">Semua biro</option>
              {(bureausQuery.data?.items ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="Divisi">
          {(props) => (
            <select
              {...props}
              className="input"
              value={filters.divisionId}
              onChange={(e) => set({ divisionId: e.target.value })}
              disabled={divisionsQuery.isError}
            >
              <option value="">Semua divisi</option>
              {(divisionsQuery.data?.items ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="Status hari">
          {(props) => (
            <select
              {...props}
              className="input"
              value={filters.dayStatus}
              onChange={(e) => set({ dayStatus: e.target.value })}
            >
              <option value="">Semua status</option>
              {Object.entries(DAY_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <div className="flex gap-2 lg:col-span-3">
          <button type="submit" className="btn-primary">
            Terapkan Filter
          </button>
        </div>
      </form>

      {reportQuery.isError ? (
        <ErrorState
          message={reportQuery.error instanceof Error ? reportQuery.error.message : 'Gagal memuat.'}
          onRetry={() => void reportQuery.refetch()}
        />
      ) : (
        <>
          <section aria-labelledby="metrics-heading">
            <h2 id="metrics-heading" className="sr-only">
              Metrik laporan
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {METRIC_LABELS.map((metric) => (
                <div key={metric.key} className="card p-3">
                  <p className="text-xl font-bold text-slate-900">
                    {reportQuery.data?.metrics ? (reportQuery.data.metrics[metric.key] ?? '-') : '-'}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{metric.label}</p>
                </div>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Denominator: terjadwal. Kategori metrik bersifat eksklusif dan dihitung backend.
            </p>
          </section>

          <DataTable
            columns={columns}
            rows={reportQuery.data?.items ?? []}
            rowKey={(row) => `${row.workDate}-${row.participantNumber}`}
            loading={reportQuery.isLoading}
            emptyTitle="Tidak ada data"
            emptyDescription="Tidak ada baris laporan yang cocok dengan filter saat ini."
            caption="Laporan absensi"
          />
          {reportQuery.data ? (
            <ServerPagination pagination={reportQuery.data.pagination} onPageChange={setPage} />
          ) : null}
        </>
      )}
    </div>
  );
}
