import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, firstFieldErrorMessage } from '../../lib/api';
import { asString, isRecord, type Paginated } from '../../lib/types';
import { DataTable, type Column } from '../../components/DataTable';
import { ErrorState } from '../../components/ErrorState';
import { ServerPagination } from '../../components/ServerPagination';
import { FetchIndicator } from '../../components/FetchIndicator';
import { ConfirmDialog } from '../../components/ConfirmDialog';

type Row = Record<string, unknown>;

export function PoliciesPanel() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    effect: 'ALLOW',
    permissionCode: '',
    conditions: '',
  });

  const policiesQuery = useQuery({
    queryKey: ['access', 'policies', page],
    queryFn: () => api<Paginated<Row>>('/admin/access/policies', { query: { page, pageSize: 15 } }),
    placeholderData: (previous) => previous,
  });

  const createMutation = useMutation({
    mutationFn: () => {
      if (!form.name || !form.permissionCode) {
        throw new ApiError('VALIDATION', 'Nama policy dan permission code wajib diisi.', 400);
      }
      let conditions: unknown = undefined;
      if (form.conditions.trim()) {
        try {
          conditions = JSON.parse(form.conditions);
        } catch {
          throw new ApiError('VALIDATION', 'Conditions harus berupa JSON yang valid.', 400);
        }
      }
      return api<Row>('/admin/access/policies', {
        method: 'POST',
        body: {
          name: form.name,
          effect: form.effect,
          permissionCode: form.permissionCode,
          ...(conditions !== undefined ? { conditions } : {}),
        },
      });
    },
    onSuccess: () => {
      setDialogOpen(false);
      setFormError(null);
      setForm({ name: '', effect: 'ALLOW', permissionCode: '', conditions: '' });
      void queryClient.invalidateQueries({ queryKey: ['access', 'policies'] });
    },
    onError: (error: unknown) => {
      setFormError((error instanceof ApiError && (firstFieldErrorMessage(error.fieldErrors) ?? error.message)) || 'Gagal membuat policy.');
    },
  });

  const columns: Column<Row>[] = [
    { header: 'Nama', cell: (row) => asString(row['name']) },
    { header: 'Permission', cell: (row) => asString(row['permissionCode']) },
    { header: 'Efek', cell: (row) => asString(row['effect']) },
    {
      header: 'Conditions',
      cell: (row) => (
        <span className="max-w-xs truncate font-mono text-xs" title={JSON.stringify(row['conditions'] ?? null)}>
          {row['conditions'] ? JSON.stringify(row['conditions']) : '-'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" className="btn-primary" onClick={() => setDialogOpen(true)}>
          Tambah Policy
        </button>
      </div>

      {policiesQuery.isError ? (
        <ErrorState
          message={policiesQuery.error instanceof Error ? policiesQuery.error.message : 'Gagal memuat.'}
          onRetry={() => void policiesQuery.refetch()}
        />
      ) : (
        <>
          <FetchIndicator show={policiesQuery.isFetching && !policiesQuery.isLoading} />
          <DataTable
            columns={columns}
            rows={(policiesQuery.data?.items ?? []).filter(isRecord) as Row[]}
            rowKey={(row) => asString(row['id'])}
            loading={policiesQuery.isLoading}
            emptyTitle="Belum ada policy"
            emptyDescription="Policy ABAC/ReBAC memperluas kontrol akses di luar role-permission."
            caption="Daftar policy ABAC/ReBAC"
          />
          {policiesQuery.data ? (
            <ServerPagination pagination={policiesQuery.data.pagination} onPageChange={setPage} />
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={dialogOpen}
        title="Tambah Policy ABAC/ReBAC"
        confirmLabel="Simpan"
        busy={createMutation.isPending}
        onClose={() => setDialogOpen(false)}
        onConfirm={() => createMutation.mutate()}
      >
        <div className="mt-3 space-y-3">
          {formError ? (
            <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{formError}</p>
          ) : null}
          <div>
            <label className="label" htmlFor="policy-name">Nama policy *</label>
            <input
              id="policy-name"
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="label" htmlFor="policy-perm">Permission code *</label>
            <input
              id="policy-perm"
              className="input font-mono"
              placeholder="mis. attendance:view:scoped"
              value={form.permissionCode}
              onChange={(e) => setForm((f) => ({ ...f, permissionCode: e.target.value }))}
            />
          </div>
          <div>
            <label className="label" htmlFor="policy-effect">Efek</label>
            <select
              id="policy-effect"
              className="input"
              value={form.effect}
              onChange={(e) => setForm((f) => ({ ...f, effect: e.target.value }))}
            >
              <option value="ALLOW">ALLOW</option>
              <option value="DENY">DENY</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="policy-conditions">Conditions (JSON, opsional)</label>
            <textarea
              id="policy-conditions"
              className="input font-mono text-xs"
              rows={4}
              placeholder='{"attribute":"scope","equals":"own"}'
              value={form.conditions}
              onChange={(e) => setForm((f) => ({ ...f, conditions: e.target.value }))}
            />
          </div>
        </div>
      </ConfirmDialog>
    </div>
  );
}
