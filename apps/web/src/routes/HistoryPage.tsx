import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, API_BASE, buildQuery } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDateWib, formatTimeWib, nextDay, todayWibDateString } from '../lib/format';
import type { AttendanceDay, Paginated } from '../lib/types';
import { DataTable, type Column } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { ErrorState } from '../components/ErrorState';
import { ServerPagination } from '../components/ServerPagination';
import { FetchIndicator } from '../components/FetchIndicator';
import { FormField } from '../components/FormField';

interface HistoryFilters {
  startDate: string;
  endDate: string;
}

const PRESETS = [
  { key: '7d', label: '7 hari terakhir' },
  { key: '30d', label: '30 hari terakhir' },
  { key: 'month', label: 'Bulan ini' },
] as const;

function presetRange(kind: (typeof PRESETS)[number]['key']): HistoryFilters {
  const today = todayWibDateString();
  if (kind === 'month') return { startDate: `${today.slice(0, 7)}-01`, endDate: today };
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (kind === '7d' ? 6 : 29));
  return { startDate: start.toISOString().slice(0, 10), endDate: today };
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<HistoryFilters>(() => presetRange('30d'));
  const [applied, setApplied] = useState(filters);

  const historyQuery = useQuery({
    queryKey: ['attendance', 'history', page, applied],
    queryFn: () =>
      api<Paginated<AttendanceDay>>('/attendance', {
        query: {
          scope: 'mine',
          page,
          pageSize: 15,
          startDate: applied.startDate,
          endDateExclusive: nextDay(applied.endDate),
        },
      }),
  });

  const columns: Column<AttendanceDay>[] = [
    { header: 'Tanggal', cell: (row) => formatDateWib(row.workDate) },
    {
      header: 'Status',
      cell: (row) => (
        <span className="flex items-center gap-1">
          <StatusBadge status={row.dayStatus} />
          {row.correctionFlag ? (
            <span
              className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800"
              title="Terdapat koreksi"
            >
              KOREKSI
            </span>
          ) : null}
        </span>
      ),
    },
    {
      header: 'Masuk',
      cell: (row) =>
        formatTimeWib(row.events.find((e) => e.eventType === 'CHECK_IN')?.occurredAtServer),
    },
    {
      header: 'Pulang',
      cell: (row) =>
        formatTimeWib(row.events.find((e) => e.eventType === 'CHECK_OUT')?.occurredAtServer),
    },
    { header: 'Catatan', cell: (row) => `${row.events.length} catatan` },
  ];

  const exportHref = `${API_BASE}/attendance/export${buildQuery({
    startDate: applied.startDate,
    endDateExclusive: nextDay(applied.endDate),
  })}`;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-stone-900">Riwayat Absensi</h1>
          <p className="text-sm text-stone-600">Data riwayat milik Anda sendiri.</p>
        </div>
        {user?.internProfileId ? (
          <a className="btn-secondary" href={exportHref} download>
            Unduh CSV
          </a>
        ) : null}
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter cepat riwayat">
        {PRESETS.map((preset) => {
          const range = presetRange(preset.key);
          const active =
            applied.startDate === range.startDate && applied.endDate === range.endDate;
          return (
            <button
              key={preset.key}
              type="button"
              aria-pressed={active}
              className={`min-h-touch rounded-full border px-4 text-sm font-medium ${
                active
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
              }`}
              onClick={() => {
                setFilters(range);
                setApplied(range);
                setPage(1);
              }}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <form
        className="card grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setApplied(filters);
        }}
        aria-label="Filter rentang tanggal riwayat"
      >
        <FormField label="Tanggal mulai">
          {(props) => (
            <input
              {...props}
              type="date"
              className="input"
              value={filters.startDate}
              onChange={(e) => setFilters((f) => ({ ...f, startDate: e.target.value }))}
            />
          )}
        </FormField>
        <FormField label="Tanggal akhir">
          {(props) => (
            <input
              {...props}
              type="date"
              className="input"
              value={filters.endDate}
              onChange={(e) => setFilters((f) => ({ ...f, endDate: e.target.value }))}
            />
          )}
        </FormField>
        <button type="submit" className="btn-primary">
          Terapkan
        </button>
      </form>

      {historyQuery.isError ? (
        <ErrorState
          message={historyQuery.error instanceof Error ? historyQuery.error.message : 'Gagal memuat.'}
          onRetry={() => void historyQuery.refetch()}
        />
      ) : (
        <>
          <FetchIndicator show={historyQuery.isFetching && !historyQuery.isLoading} />
          <DataTable
            columns={columns}
            rows={historyQuery.data?.items ?? []}
            rowKey={(row) => row.id}
            loading={historyQuery.isLoading}
            onRowClick={(row) => navigate(`/riwayat/${row.id}`)}
            emptyTitle="Belum ada riwayat"
            emptyDescription="Tidak ada catatan absensi pada rentang tanggal ini."
            caption="Riwayat absensi pribadi"
          />
          {historyQuery.data ? (
            <ServerPagination pagination={historyQuery.data.pagination} onPageChange={setPage} />
          ) : null}
        </>
      )}
    </div>
  );
}
