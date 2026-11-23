import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatWib } from '../lib/format';
import { asString, isRecord, type AuditEntry, type Paginated } from '../lib/types';
import { DataTable, type Column } from '../components/DataTable';
import { ErrorState } from '../components/ErrorState';
import { ServerPagination } from '../components/ServerPagination';
import { FetchIndicator } from '../components/FetchIndicator';
import { FormField } from '../components/FormField';
import { useDebouncedValue, usePagedFilters, useMemoizedObject } from '../hooks/useUiHelpers';

type Row = Record<string, unknown>;

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-xs font-semibold text-stone-600">{label}</p>
      <pre className="mt-1 max-h-64 overflow-auto rounded-lg bg-stone-900 p-2 font-mono text-[11px] leading-relaxed text-stone-100">
        {value === undefined || value === null ? '(kosong)' : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

// Badge aksi audit: semantik, bukan warna-saja (teks kode tetap terbaca).
const ACTION_CHIP: { test: (action: string) => boolean; cls: string }[] = [
  { test: (a) => a.includes('LOGIN_FAILED'), cls: 'bg-red-50 text-red-700 border-red-200' },
  { test: (a) => a.startsWith('EVIDENCE_ACCESS'), cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  { test: (a) => a === 'LOGIN', cls: 'bg-stone-100 text-stone-700 border-stone-300' },
  { test: (a) => a === 'LOGOUT', cls: 'bg-white text-stone-500 border-stone-200' },
];
const ACTION_CHIP_DEFAULT = 'bg-stone-100 text-stone-700 border-stone-200';

function ActionChip({ action }: { action: string }) {
  const cls = ACTION_CHIP.find((c) => c.test(action))?.cls ?? ACTION_CHIP_DEFAULT;
  return (
    <span
      className={`chip-enter inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[11px] font-medium ${cls}`}
    >
      {action}
    </span>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-icon h-9 w-9 rounded-md p-0"
      aria-label={`Salin ${label}`}
      title={copied ? 'Tersalin' : 'Salin'}
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard
          ?.writeText(value)
          .then(() => setCopied(true))
          .finally(() => setTimeout(() => setCopied(false), 1200));
      }}
    >
      {copied ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-green-600" aria-hidden="true">
          <path d="m5 13 4 4L19 7" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

export default function AuditPage() {
  const [filters, setFilters] = useState({ objectType: '', actor: '' });
  const [applied, setApplied] = useState(filters);
  const debouncedActor = useDebouncedValue(applied.actor, 400);
  const queryFilters = useMemoizedObject({ ...applied, actor: debouncedActor.slice(0, 100) });
  const { page, setPage } = usePagedFilters(queryFilters);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const auditQuery = useQuery({
    queryKey: ['audit', page, queryFilters],
    queryFn: () =>
      api<Paginated<AuditEntry & Row>>('/admin/audit', {
        query: {
          page,
          pageSize: 15,
          objectType: queryFilters.objectType || undefined,
          actor: queryFilters.actor || undefined,
        },
      }),
    placeholderData: (previous) => previous,
  });

  const columns: Column<AuditEntry & Row>[] = [
    {
      header: 'Waktu',
      className: 'font-mono text-[12px]',
      cell: (row) => formatWib(asString(row['occurredAt'] ?? row['createdAt'], '')),
    },
    {
      header: 'Aktor',
      cell: (row) => {
        const actor = asString(row['actorName'] ?? row['actorUsername'] ?? row['actor'], '');
        return actor ? actor : <span className="text-stone-300">-</span>;
      },
    },
    {
      header: 'Aksi',
      cell: (row) => <ActionChip action={asString(row['action'], '-')} />,
    },
    {
      header: 'Objek',
      className: 'font-mono text-[12px]',
      cell: (row) => {
        const type = asString(row['objectType'], '-');
        const id = asString(row['objectId'], '');
        return (
          <span className="flex items-center gap-1.5">
            <span>{type}</span>
            {id ? (
              <>
                <span className="max-w-[14ch] truncate text-stone-500" title={id}>
                  {id}
                </span>
                <CopyButton value={id} label="ID objek" />
              </>
            ) : null}
          </span>
        );
      },
    },
  ];

  const items = (auditQuery.data?.items ?? []).filter(isRecord) as unknown as (AuditEntry & Row)[];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-bold text-stone-900">Audit</h1>
        <p className="text-sm text-stone-600">
          Log perubahan sistem (read-only). Klik baris untuk melihat diff sebelum/sesudah.
        </p>
      </header>

      <form
        className="card grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(filters);
        }}
        aria-label="Filter audit"
      >
        <FormField label="Tipe objek">
          {(props) => (
            <input
              {...props}
              className="input font-mono text-xs"
              placeholder="mis. USER, SCHEDULE, LEAVE"
              maxLength={100}
              value={filters.objectType}
              onChange={(e) => setFilters((f) => ({ ...f, objectType: e.target.value }))}
            />
          )}
        </FormField>
        <FormField label="Aktor">
          {(props) => (
            <input
              {...props}
              className="input"
              placeholder="Nama/username aktor"
              maxLength={100}
              value={filters.actor}
              onChange={(e) => setFilters((f) => ({ ...f, actor: e.target.value }))}
            />
          )}
        </FormField>
        <button type="submit" className="btn-primary">Terapkan</button>
      </form>

      {auditQuery.isError ? (
        <ErrorState
          message={auditQuery.error instanceof Error ? auditQuery.error.message : 'Gagal memuat.'}
          onRetry={() => void auditQuery.refetch()}
        />
      ) : (
        <>
          <FetchIndicator show={auditQuery.isFetching && !auditQuery.isLoading} />
          <DataTable
            columns={columns}
            rows={items}
            rowKey={(row) => asString(row['id'])}
            loading={auditQuery.isLoading}
            onRowClick={(row) =>
              setExpandedId((current) => (current === asString(row['id']) ? null : asString(row['id'])))
            }
            emptyTitle="Tidak ada entri audit"
            emptyDescription="Tidak ada entri audit yang cocok dengan filter saat ini."
            caption="Log audit"
          />
          {expandedId ? (
            (() => {
              const entry = items.find((row) => asString(row['id']) === expandedId);
              if (!entry) return null;
              return (
                <section className="card notice-enter" aria-label="Diff audit (read-only)">
                  <h2 className="text-sm font-semibold text-stone-800">
                    Diff: {asString(entry['action'], '-')} pada {asString(entry['objectType'], '-')}
                  </h2>
                  <div className="mt-3 flex flex-col gap-3 md:flex-row">
                    <JsonBlock label="Sebelum (before)" value={entry['before']} />
                    <JsonBlock label="Sesudah (after)" value={entry['after']} />
                  </div>
                  <p className="mt-2 text-xs text-stone-500">Tampilan read-only untuk pemeriksaan.</p>
                </section>
              );
            })()
          ) : null}
          {auditQuery.data ? (
            <ServerPagination pagination={auditQuery.data.pagination} onPageChange={setPage} />
          ) : null}
        </>
      )}
    </div>
  );
}
