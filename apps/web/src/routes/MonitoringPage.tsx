import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { DAY_STATUS_LABELS, formatDateWib, formatTimeWib, nextDay, todayWibDateString } from '../lib/format';
import type { AttendanceDay, NamedEntity, Paginated } from '../lib/types';
import { DataTable, type Column } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { ErrorState } from '../components/ErrorState';
import { ServerPagination } from '../components/ServerPagination';
import { FormField } from '../components/FormField';
import { useDebouncedValue, usePagedFilters } from '../hooks/useUiHelpers';
import { useMemoizedObject } from '../hooks/useUiHelpers';

interface MonitoringFilters {
  startDate: string;
  endDate: string;
  dayStatus: string;
  bureauId: string;
  divisionId: string;
  search: string;
}

export default function MonitoringPage() {
  const navigate = useNavigate();
  const today = todayWibDateString();
  const [filters, setFilters] = useState<MonitoringFilters>({
    startDate: today,
    endDate: today,
    dayStatus: '',
    bureauId: '',
    divisionId: '',
    search: '',
  });
  const [applied, setApplied] = useState(filters);
  const debouncedSearch = useDebouncedValue(applied.search, 400);
  const queryFilters = useMemoizedObject({ ...applied, search: debouncedSearch.slice(0, 100) });
  const { page, setPage } = usePagedFilters(queryFilters);

  const listQuery = useQuery({
    queryKey: ['attendance', 'monitoring', page, queryFilters],
    queryFn: () =>
      api<Paginated<AttendanceDay>>('/attendance', {
        query: {
          page,
          pageSize: 15,
          startDate: queryFilters.startDate,
          endDateExclusive: nextDay(queryFilters.endDate),
          dayStatus: queryFilters.dayStatus || undefined,
          bureauId: queryFilters.bureauId || undefined,
          divisionId: queryFilters.divisionId || undefined,
          search: queryFilters.search || undefined,
        },
      }),
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

  const columns: Column<AttendanceDay>[] = [
    { header: 'Tanggal', cell: (row) => formatDateWib(row.workDate) },
    { header: 'Nama', cell: (row) => row.participantName ?? '-' },
    { header: 'Biro', cell: (row) => row.bureau ?? '-' },
    { header: 'Divisi', cell: (row) => row.division ?? '-' },
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
  ];

  const set = (patch: Partial<MonitoringFilters>) => setFilters((f) => ({ ...f, ...patch }));

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-bold text-slate-900">Monitoring Absensi</h1>
        <p className="text-sm text-slate-600">
          Data sesuai cakupan yang diizinkan server. Klik baris untuk detail dan bukti.
        </p>
      </header>

      <form
        className="card grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(filters);
        }}
        aria-label="Filter monitoring absensi"
      >
        <FormField label="Tanggal mulai">
          {(props) => (
            <input
              {...props}
              type="date"
              className="input"
              value={filters.startDate}
              onChange={(e) => set({ startDate: e.target.value })}
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
              onChange={(e) => set({ endDate: e.target.value })}
            />
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
        <FormField label="Cari peserta">
          {(props) => (
            <input
              {...props}
              type="search"
              className="input"
              maxLength={100}
              placeholder="Nama peserta…"
              value={filters.search}
              onChange={(e) => set({ search: e.target.value })}
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
        <div className="flex gap-2 sm:col-span-2 lg:col-span-2">
          <button type="submit" className="btn-primary">
            Terapkan Filter
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              const reset: MonitoringFilters = {
                startDate: today,
                endDate: today,
                dayStatus: '',
                bureauId: '',
                divisionId: '',
                search: '',
              };
              setFilters(reset);
              setApplied(reset);
            }}
          >
            Reset
          </button>
        </div>
      </form>

      {listQuery.isError ? (
        <ErrorState
          message={listQuery.error instanceof Error ? listQuery.error.message : 'Gagal memuat.'}
          onRetry={() => void listQuery.refetch()}
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={listQuery.data?.items ?? []}
            rowKey={(row) => row.id}
            loading={listQuery.isLoading}
            onRowClick={(row) => navigate(`/monitoring/${row.id}`)}
            emptyTitle="Tidak ada data"
            emptyDescription="Tidak ada catatan absensi yang cocok dengan filter saat ini."
            caption="Monitoring absensi peserta"
          />
          {listQuery.data ? (
            <ServerPagination pagination={listQuery.data.pagination} onPageChange={setPage} />
          ) : null}
        </>
      )}
    </div>
  );
}
