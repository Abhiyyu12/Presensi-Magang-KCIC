import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, firstFieldErrorMessage } from '../../lib/api';
import { asString, isRecord, type Paginated } from '../../lib/types';
import { DataTable, type Column } from '../../components/DataTable';
import { ErrorState } from '../../components/ErrorState';
import { ServerPagination } from '../../components/ServerPagination';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { SuccessNotice } from '../../components/SuccessNotice';
import { StatusBadge } from '../../components/StatusBadge';
import { Icon } from '../../components/Icon';
import { usePagedFilters } from '../../hooks/useUiHelpers';

type Row = Record<string, unknown>;

interface RoleItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  isSystem: boolean;
  activeUserCount?: number;
}

const asRole = (row: unknown): RoleItem | null =>
  isRecord(row) && typeof row['id'] === 'string'
    ? {
        id: row['id'],
        code: asString(row['code']),
        name: asString(row['name']),
        description: typeof row['description'] === 'string' ? row['description'] : null,
        status: asString(row['status'], 'ACTIVE'),
        isSystem: row['isSystem'] === true,
        activeUserCount: typeof row['activeUserCount'] === 'number' ? row['activeUserCount'] : 0,
      }
    : null;

export function RolesPanel() {
  const queryClient = useQueryClient();
  const { page, setPage, pageSize, setPageSize } = usePagedFilters({}, 10);
  const [statusFilter, setStatusFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<RoleItem | null>(null);
  const [deleteRow, setDeleteRow] = useState<RoleItem | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState({ code: '', name: '', description: '' });
  const [editForm, setEditForm] = useState({ name: '', description: '', status: 'ACTIVE' });

  const rolesQuery = useQuery({
    queryKey: ['access', 'roles', page, pageSize, statusFilter],
    queryFn: () =>
      api<Paginated<Row>>('/admin/access/roles', {
        query: { page: String(page), pageSize: String(pageSize), ...(statusFilter ? { status: statusFilter } : {}) },
      }),
    placeholderData: (previous) => previous,
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['access', 'roles'] });

  const createMutation = useMutation({
    mutationFn: () => {
      if (!createForm.code.trim() || !createForm.name.trim()) {
        throw new ApiError('VALIDATION', 'Kode dan nama role wajib diisi.', 400);
      }
      return api<Row>('/admin/access/roles', {
        method: 'POST',
        body: {
          code: createForm.code.trim(),
          name: createForm.name.trim(),
          ...(createForm.description.trim() ? { description: createForm.description.trim() } : {}),
        },
      });
    },
    onSuccess: () => {
      setCreateOpen(false);
      setFormError(null);
      setNotice('Role baru berhasil dibuat. Atur permission-nya pada menu Akses.');
      setCreateForm({ code: '', name: '', description: '' });
      invalidate();
    },
    onError: (error: unknown) => {
      setFormError((error instanceof ApiError && (firstFieldErrorMessage(error.fieldErrors) ?? error.message)) || 'Gagal membuat role.');
    },
  });

  const editMutation = useMutation({
    mutationFn: () =>
      api<Row>(`/admin/access/roles/${editRow?.id}`, {
        method: 'PATCH',
        body: {
          name: editForm.name,
          ...(editForm.description.trim() ? { description: editForm.description } : { description: null }),
          status: editForm.status,
        },
      }),
    onSuccess: () => {
      setEditRow(null);
      setFormError(null);
      setNotice('Perubahan role disimpan.');
      invalidate();
    },
    onError: (error: unknown) => {
      setFormError((error instanceof ApiError && (firstFieldErrorMessage(error.fieldErrors) ?? error.message)) || 'Gagal memperbarui role.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api<Row>(`/admin/access/roles/${deleteRow?.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setDeleteRow(null);
      setFormError(null);
      setNotice('Role dihapus.');
      invalidate();
    },
    onError: (error: unknown) => {
      // Role dipakai pengguna → tampilkan alasan penolakan server, jangan tutup dialog.
      setFormError((error instanceof ApiError && (firstFieldErrorMessage(error.fieldErrors) ?? error.message)) || 'Gagal menghapus role.');
    },
  });

  const items = (rolesQuery.data?.items ?? []).map(asRole).filter((r): r is RoleItem => r !== null);

  const columns: Column<RoleItem>[] = [
    { header: 'Kode', cell: (row) => row.code },
    { header: 'Nama', cell: (row) => row.name },
    { header: 'Deskripsi', cell: (row) => row.description || '-' },
    { header: 'Status', cell: (row) => <StatusBadge kind="neutral" status={row.status} label={row.status === 'INACTIVE' ? 'Nonaktif' : 'Aktif'} /> },
    { header: 'Jumlah pengguna', cell: (row) => String(row.activeUserCount ?? 0) },
    {
      header: 'Aksi',
      cell: (row) => (
        <span className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-icon"
            aria-label={`Ubah role ${row.code}`}
            title="Ubah role"
            onClick={() => {
              setEditRow(row);
              setEditForm({ name: row.name, description: row.description ?? '', status: row.status });
              setFormError(null);
            }}
          >
            <Icon name="pencil" />
          </button>
          {row.isSystem || (row.activeUserCount ?? 0) > 0 ? null : (
            <button
              type="button"
              className="btn-icon-danger"
              aria-label={`Hapus role ${row.code}`}
              title="Hapus role"
              onClick={() => {
                setDeleteRow(row);
                setFormError(null);
              }}
            >
              <Icon name="trash" />
            </button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      {notice ? <SuccessNotice message={notice} onDismiss={() => setNotice(null)} /> : null}
      {formError && !deleteRow ? (
        <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{formError}</p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-stone-600">Status</span>
          <select
            aria-label="Filter status role"
            className="input w-auto min-h-touch"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Semua</option>
            <option value="ACTIVE">Aktif</option>
            <option value="INACTIVE">Nonaktif</option>
          </select>
        </label>
        <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
          Tambah Role
        </button>
      </div>

      {rolesQuery.isError ? (
        <ErrorState
          message={rolesQuery.error instanceof Error ? rolesQuery.error.message : 'Gagal memuat.'}
          onRetry={() => void rolesQuery.refetch()}
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={items}
            rowKey={(row) => row.id}
            loading={rolesQuery.isLoading}
            emptyTitle="Belum ada role"
            caption="Daftar role"
          />
          {rolesQuery.data ? (
            <ServerPagination
              pagination={rolesQuery.data.pagination}
              onPageChange={setPage}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
            />
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={createOpen}
        title="Tambah Role"
        confirmLabel="Simpan"
        busy={createMutation.isPending}
        onClose={() => setCreateOpen(false)}
        onConfirm={() => createMutation.mutate()}
      >
        <div className="mt-3 space-y-3">
          <p className="text-sm text-stone-600">Role baru dibuat tanpa permission. Atur permission-nya pada menu Akses.</p>
          <div>
            <label className="label" htmlFor="role-create-code">Kode role<span className="ml-0.5 text-red-600">*</span></label>
            <input
              id="role-create-code"
              className="input"
              value={createForm.code}
              onChange={(e) => setCreateForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="mis. PENGAWAS"
            />
          </div>
          <div>
            <label className="label" htmlFor="role-create-name">Nama role<span className="ml-0.5 text-red-600">*</span></label>
            <input
              id="role-create-name"
              className="input"
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="label" htmlFor="role-create-desc">Deskripsi</label>
            <textarea
              id="role-create-desc"
              className="input"
              rows={2}
              value={createForm.description}
              onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={editRow !== null}
        title={`Ubah Role ${editRow?.code ?? ''}`}
        confirmLabel="Simpan"
        busy={editMutation.isPending}
        onClose={() => setEditRow(null)}
        onConfirm={() => editMutation.mutate()}
      >
        <div className="mt-3 space-y-3">
          <div>
            <label className="label" htmlFor="role-edit-name">Nama role<span className="ml-0.5 text-red-600">*</span></label>
            <input
              id="role-edit-name"
              className="input"
              value={editForm.name}
              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="label" htmlFor="role-edit-desc">Deskripsi</label>
            <textarea
              id="role-edit-desc"
              className="input"
              rows={2}
              value={editForm.description}
              onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div>
            <label className="label" htmlFor="role-edit-status">Status</label>
            <select
              id="role-edit-status"
              className="input"
              value={editForm.status}
              disabled={editRow?.isSystem}
              onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
            >
              <option value="ACTIVE">Aktif</option>
              <option value="INACTIVE">Nonaktif</option>
            </select>
            {editRow?.isSystem ? (
              <p className="mt-1 text-xs text-stone-500">Role sistem tidak dapat mengubah status.</p>
            ) : null}
          </div>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={deleteRow !== null}
        title={`Hapus Role ${deleteRow?.code ?? ''}`}
        description={`Role "${deleteRow?.name ?? ''}" akan dihapus permanen beserta daftar permission-nya. Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Ya, Hapus"
        danger
        busy={deleteMutation.isPending}
        onClose={() => {
          setDeleteRow(null);
        }}
        onConfirm={() => deleteMutation.mutate()}
      >
        {formError && deleteRow ? (
          <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{formError}</p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
