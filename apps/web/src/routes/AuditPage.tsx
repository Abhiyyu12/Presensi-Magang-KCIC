import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatWib } from '../lib/format';
import { asString, isRecord, type AuditEntry, type Paginated } from '../lib/types';
import { DataTable, type Column } from '../components/DataTable';
import { ErrorState } from '../components/ErrorState';
import { ServerPagination } from '../components/ServerPagination';
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
    { header: 'Waktu', cell: (row) => formatWib(asString(row['occurredAt'] ?? row['createdAt'], '')) },
    {
      header: 'Aktor',
      cell: (row) => asString(row['actorName'] ?? row['actorUsername'] ?? row['actor'], '-'),
    },
    { header: 'Aksi', cell: (row) => asString(row['action'], '-') },
    { header: 'Objek', cell: (row) => `${asString(row['objectType'], '-')} · ${asString(row['objectId'], '')}`.trim() },
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
                <section className="card" aria-label="Diff audit (read-only)">
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
