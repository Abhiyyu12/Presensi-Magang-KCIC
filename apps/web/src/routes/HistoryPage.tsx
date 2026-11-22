import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatDateWib, formatTimeWib, nextDay, todayWibDateString } from '../lib/format';
import type { AttendanceDay, Paginated } from '../lib/types';
import { DataTable, type Column } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { ErrorState } from '../components/ErrorState';
import { ServerPagination } from '../components/ServerPagination';
import { FormField } from '../components/FormField';

interface HistoryFilters {
  startDate: string;
  endDate: string;
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<HistoryFilters>(() => {
    const today = todayWibDateString();
    const start = new Date(`${today}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 29);
    return { startDate: start.toISOString().slice(0, 10), endDate: today };
  });
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
      header: 'Check-in',
      cell: (row) =>
        formatTimeWib(row.events.find((e) => e.eventType === 'CHECK_IN')?.occurredAtServer),
    },
    {
      header: 'Check-out',
      cell: (row) =>
        formatTimeWib(row.events.find((e) => e.eventType === 'CHECK_OUT')?.occurredAtServer),
    },
    { header: 'Event', cell: (row) => `${row.events.length} event` },
  ];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-bold text-slate-900">Riwayat Absensi</h1>
        <p className="text-sm text-slate-600">Data riwayat milik Anda sendiri.</p>
      </header>

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
