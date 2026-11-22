import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { formatDateWib, formatWib, LEAVE_TYPE_LABELS } from '../lib/format';
import type { Leave, Paginated } from '../lib/types';
import { DataTable, type Column } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';
import { ErrorState } from '../components/ErrorState';
import { ServerPagination } from '../components/ServerPagination';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FormField } from '../components/FormField';

type Decision = 'approve' | 'reject';

export default function ApprovalsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [selected, setSelected] = useState<Leave | null>(null);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [note, setNote] = useState('');
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const leavesQuery = useQuery({
    queryKey: ['leaves', 'all', statusFilter, page],
    queryFn: () =>
      api<Paginated<Leave>>('/leaves', {
        query: { scope: 'all', status: statusFilter, page, pageSize: 15 },
      }),
    placeholderData: (previous) => previous,
  });

  const decisionMutation = useMutation({
    mutationFn: async () => {
      if (!selected || !decision) return;
      const path = `/leaves/${selected.id}/${decision}`;
      await api<Leave>(path, {
        method: 'POST',
        body: decision === 'approve' ? (note ? { note } : {}) : { note },
      });
    },
    onSuccess: () => {
      setDecisionError(null);
      setSelected(null);
      setDecision(null);
      setNote('');
      void queryClient.invalidateQueries({ queryKey: ['leaves'] });
    },
    onError: (error: unknown) => {
      setDecisionError(error instanceof ApiError ? error.message : 'Gagal memproses keputusan.');
    },
  });

  const noteInvalid = decision === 'reject' && note.trim().length < 3;

  const columns: Column<Leave>[] = [
    { header: 'Tanggal', cell: (row) => formatDateWib(row.createdAt ?? row.estimatedDepartureAt) },
    { header: 'Peserta', cell: (row) => row.participantName ?? '-' },
    { header: 'Biro/Divisi', cell: (row) => [row.bureau, row.division].filter(Boolean).join(' / ') || '-' },
    { header: 'Jenis', cell: (row) => LEAVE_TYPE_LABELS[row.leaveType] ?? row.leaveType },
    {
      header: 'Estimasi keluar',
      cell: (row) => formatWib(row.estimatedDepartureAt),
    },
    { header: 'Status', cell: (row) => <StatusBadge kind="leaveStatus" status={row.status} /> },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Approval Izin</h1>
          <p className="text-sm text-slate-600">
            Antrean pengajuan izin sesuai cakupan Anda. Penolakan wajib disertai catatan.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="approval-status-filter">
            Filter status
          </label>
          <select
            id="approval-status-filter"
            className="input"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="PENDING">Menunggu</option>
            <option value="APPROVED">Disetujui</option>
            <option value="REJECTED">Ditolak</option>
            <option value="">Semua</option>
          </select>
        </div>
      </header>

      {leavesQuery.isError ? (
        <ErrorState
          message={leavesQuery.error instanceof Error ? leavesQuery.error.message : 'Gagal memuat.'}
          onRetry={() => void leavesQuery.refetch()}
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={leavesQuery.data?.items ?? []}
            rowKey={(row) => row.id}
            loading={leavesQuery.isLoading}
            onRowClick={(row) => setSelected(row)}
            emptyTitle="Tidak ada pengajuan"
            emptyDescription="Tidak ada pengajuan izin yang cocok dengan filter saat ini."
            caption="Antrean approval izin"
          />
          {leavesQuery.data ? (
            <ServerPagination pagination={leavesQuery.data.pagination} onPageChange={setPage} />
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={selected !== null && decision === null}
        title="Detail pengajuan izin"
        confirmLabel="Setujui"
        cancelLabel="Tutup"
        onClose={() => {
          setSelected(null);
          setNote('');
          setDecisionError(null);
        }}
        onConfirm={() => setDecision('approve')}
      >
        {selected ? (
          <div className="mt-3 space-y-1 text-sm text-slate-700">
            <p>
              <strong>{selected.participantName ?? 'Peserta'}</strong>
              {selected.bureau ? ` · ${selected.bureau}` : ''}
              {selected.division ? ` · ${selected.division}` : ''}
            </p>
            <p>Jenis: {LEAVE_TYPE_LABELS[selected.leaveType] ?? selected.leaveType}</p>
            {selected.categoryName ? <p>Kategori: {selected.categoryName}</p> : null}
            <p>Alasan: {selected.reason ?? '-'}</p>
            <p>Estimasi keluar: {formatWib(selected.estimatedDepartureAt)}</p>
            {selected.estimatedReturnAt ? (
              <p>Estimasi kembali: {formatWib(selected.estimatedReturnAt)}</p>
            ) : null}
            <div className="pt-2">
              <button
                type="button"
                className="btn-danger w-full"
                onClick={() => setDecision('reject')}
              >
                Tolak
              </button>
            </div>
          </div>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={selected !== null && decision !== null}
        title={decision === 'approve' ? 'Setujui pengajuan izin?' : 'Tolak pengajuan izin?'}
        description={
          decision === 'approve'
            ? 'Catatan bersifat opsional.'
            : 'Catatan penolakan wajib diisi (minimal 3 karakter).'
        }
        confirmLabel={decision === 'approve' ? 'Ya, Setujui' : 'Ya, Tolak'}
        danger={decision === 'reject'}
        busy={decisionMutation.isPending}
        onClose={() => {
          setDecision(null);
          setNote('');
          setDecisionError(null);
        }}
        onConfirm={() => {
          if (noteInvalid) return;
          decisionMutation.mutate();
        }}
      >
        <div className="mt-3 space-y-2">
          {decisionError ? (
            <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">
              {decisionError}
            </p>
          ) : null}
          <FormField
            label="Catatan"
            required={decision === 'reject'}
            error={noteInvalid ? 'Catatan penolakan minimal 3 karakter.' : undefined}
          >
            {(props) => (
              <textarea
                {...props}
                className="input"
                rows={3}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            )}
          </FormField>
        </div>
      </ConfirmDialog>
    </div>
  );
}
