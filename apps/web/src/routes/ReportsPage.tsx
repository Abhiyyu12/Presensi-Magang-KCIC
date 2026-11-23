import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, API_BASE, buildQuery } from '../lib/api';
import { useAuth } from '../lib/auth';
import { DAY_STATUS_LABELS, formatDateWib, formatTimeWib, nextDay, todayWibDateString } from '../lib/format';
import { LEAVE_TYPE_LABELS } from '../lib/format';
import type { NamedEntity, Paginated, ReportMetrics, ReportRow } from '../lib/types';
import { DataTable, type Column } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { ErrorState } from '../components/ErrorState';
import { ServerPagination } from '../components/ServerPagination';
import { FetchIndicator } from '../components/FetchIndicator';
import { AnimatedNumber } from '../components/motion-primitives';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { FormField } from '../components/FormField';
import { usePagedFilters, useMemoizedObject } from '../hooks/useUiHelpers';

interface ReportFilters {
  startDate: string;
  endDate: string;
  bureauId: string;
  divisionId: string;
  dayStatus: string;
}

// 12 metrik dikelompokkan jadi 3 seksi (brief): hierarki konteks, bukan deretan kartu datar.
const METRIC_GROUPS: { title: string; metrics: { key: keyof ReportMetrics; label: string }[] }[] = [
  {
    title: 'Kehadiran',
    metrics: [
      { key: 'terjadwal', label: 'Terjadwal' },
      { key: 'hadir', label: 'Hadir' },
      { key: 'tepatWaktu', label: 'Tepat Waktu' },
      { key: 'terlambat', label: 'Terlambat' },
    ],
  },
  {
    title: 'Kelengkapan',
    metrics: [
      { key: 'lengkap', label: 'Lengkap' },
      { key: 'belumLengkap', label: 'Belum Lengkap' },
      { key: 'tidakAdaCatatan', label: 'Tidak Ada Catatan' },
    ],
  },
  {
    title: 'Izin & Koreksi',
    metrics: [
      { key: 'izinPending', label: 'Izin Pending' },
      { key: 'sedangIzin', label: 'Sedang Izin' },
      { key: 'sudahKembali', label: 'Sudah Kembali' },
      { key: 'perluReview', label: 'Perlu Review' },
      { key: 'pulangAwal', label: 'Pulang Awal' },
      { key: 'koreksi', label: 'Koreksi' },
    ],
  },
];

export default function ReportsPage() {
  const { has } = useAuth();
  const canExport = has('report:export');
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
  const { page, setPage, pageSize, setPageSize } = usePagedFilters(queryFilters, 10);
  const [detailRow, setDetailRow] = useState<ReportRow | null>(null);

  const commonQuery = {
    startDate: queryFilters.startDate,
    endDateExclusive: nextDay(queryFilters.endDate),
    bureauId: queryFilters.bureauId || undefined,
    divisionId: queryFilters.divisionId || undefined,
    dayStatus: queryFilters.dayStatus || undefined,
  };

  const reportQuery = useQuery({
    queryKey: ['reports', 'attendance', page, pageSize, queryFilters],
    queryFn: () =>
      api<{ items: ReportRow[]; metrics: ReportMetrics; pagination: Paginated<never>['pagination'] }>(
        '/reports/attendance',
        { query: { ...commonQuery, page, pageSize } },
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

  // Feedback tombol ekspor: loading singkat → centang sukses → normal (unduhan tetap native).
  const [exportFlash, setExportFlash] = useState<{ format: 'csv' | 'xlsx'; phase: 'busy' | 'done' } | null>(null);
  const exportTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => exportTimers.current.forEach(clearTimeout), []);
  const onExport = (format: 'csv' | 'xlsx') => {
    setExportFlash({ format, phase: 'busy' });
    exportTimers.current.push(setTimeout(() => setExportFlash({ format, phase: 'done' }), 700));
    exportTimers.current.push(setTimeout(() => setExportFlash(null), 1400));
  };

  const exportButton = (format: 'csv' | 'xlsx') => {
    const flash = exportFlash?.format === format ? exportFlash : null;
    const primary = format === 'xlsx';
    const label = `Ekspor ${format.toUpperCase()}`;
    return (
      <a
        className={primary ? 'btn-primary' : 'btn-secondary'}
        href={exportHref(format)}
        download
        onClick={() => onExport(format)}
      >
        {flash?.phase === 'busy' ? (
          <>
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
              <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            </svg>
            Mengekspor…
          </>
        ) : flash?.phase === 'done' ? (
          <>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="m5 13 4 4L19 7" />
            </svg>
            {label}
          </>
        ) : (
          label
        )}
      </a>
    );
  };

  const columns: Column<ReportRow>[] = [
    { header: 'Tanggal', cell: (row) => formatDateWib(row.workDate) },
    { header: 'No. ID', className: 'font-mono text-[13px]', cell: (row) => row.participantNumber ?? '-' },
    { header: 'Nama', cell: (row) => row.participantName },
    { header: 'Direktorat', cell: (row) => row.bureau ?? '-' },
    { header: 'Biro', cell: (row) => row.division ?? '-' },
    {
      header: 'Masuk',
      className: 'font-mono text-[13px]',
      cell: (row) => {
        const v = formatTimeWib(row.checkIn);
        return v === '-' ? <span className="text-stone-300">-</span> : v;
      },
    },
    {
      header: 'Pulang',
      className: 'font-mono text-[13px]',
      cell: (row) => {
        const v = formatTimeWib(row.checkOut);
        return v === '-' ? <span className="text-stone-300">-</span> : v;
      },
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
    {
      header: 'Izin',
      cell: (row) =>
        row.leaves && row.leaves.length > 0 ? (
          row.leaves.map((l) => (l.leaveType === 'TEMPORARY' ? 'Sementara' : 'Pulang awal')).join(', ')
        ) : (
          <span className="text-stone-300">-</span>
        ),
    },
    {
      header: 'Aksi',
      cell: (row) => (
        <button
          type="button"
          className="btn-icon"
          aria-label={`Detail laporan ${row.participantName}`}
          title="Lihat detail"
          onClick={() => setDetailRow(row)}
        >
          <Icon name="eye" />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-stone-900">Laporan &amp; Statistik</h1>
          <p className="text-sm text-stone-600">
            Metrik dihitung server sesuai filter dan cakupan Anda. Denominator: terjadwal.
          </p>
        </div>
        {canExport ? <div className="flex gap-2">{exportButton('csv')}{exportButton('xlsx')}</div> : null}
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
        <FormField label="Direktorat">
          {(props) => (
            <select
              {...props}
              className="input"
              value={filters.bureauId}
              onChange={(e) => set({ bureauId: e.target.value })}
              disabled={bureausQuery.isError}
            >
              <option value="">Semua direktorat</option>
              {(bureausQuery.data?.items ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="Biro">
          {(props) => (
            <select
              {...props}
              className="input"
              value={filters.divisionId}
              onChange={(e) => set({ divisionId: e.target.value })}
              disabled={divisionsQuery.isError}
            >
              <option value="">Semua biro</option>
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
          <FetchIndicator show={reportQuery.isFetching && !reportQuery.isLoading} />
          <section aria-labelledby="metrics-heading" className="stagger space-y-3">
            <h2 id="metrics-heading" className="sr-only">
              Metrik laporan
            </h2>
            {METRIC_GROUPS.map((group) => (
              <div key={group.title} className="card p-3">
                <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-stone-400">
                  <span aria-hidden="true" className="h-px w-4 bg-brand-300" />
                  {group.title}
                </p>
                <div
                  className={`grid gap-2 ${
                    group.metrics.length > 4
                      ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'
                      : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
                  }`}
                >
                  {group.metrics.map((metric, mi) => {
                    const raw = reportQuery.data?.metrics?.[metric.key];
                    const value = typeof raw === 'number' ? raw : undefined;
                    return (
                      <div
                        key={metric.key}
                        className={`rounded-lg p-2.5 ${mi === 0 ? 'bg-brand-50/50 ring-1 ring-brand-100' : 'bg-stone-50'}`}
                      >
                        <p className="font-display text-xl font-bold text-stone-900">
                          <AnimatedNumber value={value} />
                        </p>
                        <p className="mt-0.5 text-[11px] text-stone-500">{metric.label}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <p className="text-xs text-stone-500">
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
            <ServerPagination
              pagination={reportQuery.data.pagination}
              onPageChange={setPage}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
            />
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={detailRow !== null}
        title="Detail baris laporan"
        confirmLabel="Tutup"
        hideCancel
        onConfirm={() => setDetailRow(null)}
        onClose={() => setDetailRow(null)}
      >
        {detailRow ? (
          <div className="mt-3 space-y-1 text-sm text-stone-700">
            <p>
              <strong>{detailRow.participantName}</strong>
              {detailRow.participantNumber ? ` · ${detailRow.participantNumber}` : ''}
            </p>
            <p>{[detailRow.bureau, detailRow.division].filter(Boolean).join(' / ') || '-'}</p>
            <p>Tanggal: {formatDateWib(detailRow.workDate)}</p>
            <p>Masuk: {formatTimeWib(detailRow.checkIn)}</p>
            <p>Pulang: {formatTimeWib(detailRow.checkOut)}</p>
            <p>
              Status: <StatusBadge status={detailRow.dayStatus} />
              {detailRow.correctionFlag ? ' (koreksi)' : ''}
            </p>
            {detailRow.leaves && detailRow.leaves.length > 0 ? (
              <div className="mt-2 space-y-2 border-t border-stone-100 pt-2">
                {detailRow.leaves.map((l, i) => (
                  <div key={i}>
                    <p className="font-semibold">
                      {LEAVE_TYPE_LABELS[l.leaveType] ?? l.leaveType} · {l.status}
                      {l.durationMinutes !== null && l.durationMinutes !== undefined
                        ? ` · ${l.durationMinutes} menit`
                        : ''}
                    </p>
                    <p>Alasan: {l.reason ?? '-'}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
