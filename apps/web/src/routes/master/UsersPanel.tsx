import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { asString, isRecord, type Paginated } from '../../lib/types';
import { DataTable, type Column } from '../../components/DataTable';
import { ErrorState } from '../../components/ErrorState';
import { ServerPagination } from '../../components/ServerPagination';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { SuccessNotice } from '../../components/SuccessNotice';

type Row = Record<string, unknown>;

interface RoleRow {
  id: string;
  code?: string;
  name?: string;
}

export function UsersPanel() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [rolesRow, setRolesRow] = useState<Row | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState({
    username: '',
    displayName: '',
    password: '',
    email: '',
    phone: '',
    roleIds: [] as string[],
  });
  const [editForm, setEditForm] = useState({
    displayName: '',
    email: '',
    phone: '',
    accountStatus: 'ACTIVE',
  });
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);

  const usersQuery = useQuery({
    queryKey: ['master', 'users', page],
    queryFn: () => api<Paginated<Row>>('/admin/users', { query: { page, pageSize: 15 } }),
    placeholderData: (previous) => previous,
  });

  const rolesQuery = useQuery({
    queryKey: ['master', 'roles-catalog'],
    queryFn: () => api<{ items: RoleRow[] }>('/admin/roles'),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['master', 'users'] });

  const createMutation = useMutation({
    mutationFn: () => {
      if (!createForm.username || !createForm.displayName || !createForm.password) {
        throw new ApiError('VALIDATION', 'Username, nama tampilan, dan kata sandi wajib diisi.', 400);
      }
      if (createForm.password.length < 8) {
        throw new ApiError('VALIDATION', 'Kata sandi minimal 8 karakter.', 400);
      }
      return api<Row>('/admin/users', {
        method: 'POST',
        body: {
          username: createForm.username,
          displayName: createForm.displayName,
          password: createForm.password,
          ...(createForm.email ? { email: createForm.email } : {}),
          ...(createForm.phone ? { phone: createForm.phone } : {}),
          roleIds: createForm.roleIds,
        },
      });
    },
    onSuccess: () => {
      setCreateOpen(false);
      setFormError(null);
      setNotice('Pengguna baru berhasil dibuat.');
      setCreateForm({ username: '', displayName: '', password: '', email: '', phone: '', roleIds: [] });
      invalidate();
    },
    onError: (error: unknown) => {
      setFormError(error instanceof ApiError ? error.message : 'Gagal membuat pengguna.');
    },
  });

  const editMutation = useMutation({
    mutationFn: () =>
      api<Row>(`/admin/users/${asString(editRow?.['id'])}`, {
        method: 'PATCH',
        body: {
          displayName: editForm.displayName || undefined,
          email: editForm.email || undefined,
          phone: editForm.phone || undefined,
          accountStatus: editForm.accountStatus,
        },
      }),
    onSuccess: () => {
      setEditRow(null);
      setFormError(null);
      setNotice('Perubahan data pengguna disimpan.');
      invalidate();
    },
    onError: (error: unknown) => {
      setFormError(error instanceof ApiError ? error.message : 'Gagal memperbarui pengguna.');
    },
  });

  const rolesMutation = useMutation({
    mutationFn: () =>
      api<Row>(`/admin/users/${asString(rolesRow?.['id'])}/roles`, {
        method: 'POST',
        body: { roleIds: selectedRoleIds },
      }),
    onSuccess: () => {
      setRolesRow(null);
      setFormError(null);
      setNotice('Role pengguna diperbarui.');
      invalidate();
    },
    onError: (error: unknown) => {
      setFormError(error instanceof ApiError ? error.message : 'Gagal mengubah role.');
    },
  });

  const resetMutation = useMutation({
    mutationFn: (row: Row) =>
      api<unknown>(`/admin/users/${asString(row['id'])}/password-reset-token`, { method: 'POST' }),
    onSuccess: (data: unknown) => {
      const token = isRecord(data) ? asString(data['token'] ?? data['resetToken'], '') : '';
      setResetToken(token || (typeof data === 'string' ? data : '(token tidak ditampilkan server)'));
    },
    onError: (error: unknown) => {
      setFormError(error instanceof ApiError ? error.message : 'Gagal membuat token reset.');
    },
  });

  const roles = rolesQuery.data?.items ?? [];

  const columns: Column<Row>[] = [
    { header: 'Username', cell: (row) => asString(row['username']) },
    { header: 'Nama tampilan', cell: (row) => asString(row['displayName']) },
    { header: 'Email', cell: (row) => asString(row['email']) },
    { header: 'Status akun', cell: (row) => asString(row['accountStatus']) },
    {
      header: 'Role',
      cell: (row) =>
        Array.isArray(row['roles'])
          ? (row['roles'] as unknown[])
              .map((r) => (isRecord(r) ? asString(r['code'] ?? r['name']) : String(r)))
              .join(', ') || '-'
          : '-',
    },
    {
      header: 'Aksi',
      cell: (row) => (
        <span className="flex flex-wrap gap-2">
          <button
            type="button"
            className="min-h-touch rounded-lg border border-slate-200 px-3 text-xs font-semibold text-brand-700 hover:bg-brand-50"
            onClick={() => {
              setEditRow(row);
              setEditForm({
                displayName: asString(row['displayName'], ''),
                email: asString(row['email'], ''),
                phone: asString(row['phone'], ''),
                accountStatus: asString(row['accountStatus'], 'ACTIVE'),
              });
              setFormError(null);
            }}
          >
            Ubah
          </button>
          <button
            type="button"
            className="min-h-touch rounded-lg border border-slate-200 px-3 text-xs font-semibold text-brand-700 hover:bg-brand-50"
            onClick={() => {
              setRolesRow(row);
              setSelectedRoleIds(
                Array.isArray(row['roles'])
                  ? (row['roles'] as unknown[])
                      .filter(isRecord)
                      .map((r) => asString(r['id'], ''))
                      .filter(Boolean)
                  : [],
              );
              setFormError(null);
            }}
          >
            Atur Role
          </button>
          <button
            type="button"
            className="min-h-touch rounded-lg border border-amber-200 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
            disabled={resetMutation.isPending}
            onClick={() => resetMutation.mutate(row)}
          >
            Token Reset
          </button>
        </span>
      ),
    },
  ];

  const roleCheckboxes = (selected: string[], onChange: (ids: string[]) => void) => (
    <fieldset className="space-y-1">
      <legend className="label">Role</legend>
      {roles.map((role) => (
        <label key={role.id} className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300"
            checked={selected.includes(role.id)}
            onChange={(e) =>
              onChange(
                e.target.checked
                  ? [...selected, role.id]
                  : selected.filter((id) => id !== role.id),
              )
            }
          />
          {role.name ?? role.code ?? role.id}
          {role.code ? <span className="text-xs text-slate-400">({role.code})</span> : null}
        </label>
      ))}
    </fieldset>
  );

  return (
    <div className="space-y-3">
      {notice ? <SuccessNotice message={notice} onDismiss={() => setNotice(null)} /> : null}
      {formError ? (
        <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{formError}</p>
      ) : null}
      {resetToken ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3" role="status">
          <p className="text-sm font-semibold text-amber-900">Token reset kata sandi (satu kali)</p>
          <p className="mt-1 break-all font-mono text-xs text-amber-800">{resetToken}</p>
          <p className="mt-1 text-xs text-amber-700">
            Simpan dan berikan ke pengguna sekarang; token tidak ditampilkan lagi.
          </p>
          <button type="button" className="btn-secondary mt-2 px-3 py-1 text-xs" onClick={() => setResetToken(null)}>
            Tutup
          </button>
        </div>
      ) : null}
      <div className="flex justify-end">
        <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
          Tambah Pengguna
        </button>
      </div>

      {usersQuery.isError ? (
        <ErrorState
          message={usersQuery.error instanceof Error ? usersQuery.error.message : 'Gagal memuat.'}
          onRetry={() => void usersQuery.refetch()}
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={(usersQuery.data?.items ?? []).filter(isRecord) as Row[]}
            rowKey={(row) => asString(row['id'])}
            loading={usersQuery.isLoading}
            emptyTitle="Belum ada pengguna"
            caption="Data pengguna"
          />
          {usersQuery.data ? (
            <ServerPagination pagination={usersQuery.data.pagination} onPageChange={setPage} />
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={createOpen}
        title="Tambah Pengguna"
        confirmLabel="Simpan"
        busy={createMutation.isPending}
        onClose={() => setCreateOpen(false)}
        onConfirm={() => createMutation.mutate()}
      >
        <div className="mt-3 max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {(
            [
              ['username', 'Username', 'text', true],
              ['displayName', 'Nama tampilan', 'text', true],
              ['password', 'Kata sandi awal (min. 8 karakter)', 'password', true],
              ['email', 'Email', 'email', false],
              ['phone', 'Telepon', 'tel', false],
            ] as const
          ).map(([name, label, type, required]) => (
            <div key={name}>
              <label className="label" htmlFor={`user-create-${name}`}>
                {label}
                {required ? <span className="ml-0.5 text-red-600">*</span> : null}
              </label>
              <input
                id={`user-create-${name}`}
                type={type}
                className="input"
                value={createForm[name]}
                onChange={(e) => setCreateForm((f) => ({ ...f, [name]: e.target.value }))}
              />
            </div>
          ))}
          {roleCheckboxes(createForm.roleIds, (roleIds) =>
            setCreateForm((f) => ({ ...f, roleIds })),
          )}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={editRow !== null}
        title="Ubah Pengguna"
        confirmLabel="Simpan"
        busy={editMutation.isPending}
        onClose={() => setEditRow(null)}
        onConfirm={() => editMutation.mutate()}
      >
        <div className="mt-3 space-y-3">
          {(
            [
              ['displayName', 'Nama tampilan', 'text'],
              ['email', 'Email', 'email'],
              ['phone', 'Telepon', 'tel'],
            ] as const
          ).map(([name, label, type]) => (
            <div key={name}>
              <label className="label" htmlFor={`user-edit-${name}`}>
                {label}
              </label>
              <input
                id={`user-edit-${name}`}
                type={type}
                className="input"
                value={editForm[name]}
                onChange={(e) => setEditForm((f) => ({ ...f, [name]: e.target.value }))}
              />
            </div>
          ))}
          <div>
            <label className="label" htmlFor="user-edit-status">
              Status akun
            </label>
            <select
              id="user-edit-status"
              className="input"
              value={editForm.accountStatus}
              onChange={(e) => setEditForm((f) => ({ ...f, accountStatus: e.target.value }))}
            >
              <option value="ACTIVE">Aktif</option>
              <option value="INACTIVE">Nonaktif</option>
              <option value="SUSPENDED">Ditangguhkan</option>
            </select>
          </div>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={rolesRow !== null}
        title="Atur Role Pengguna"
        confirmLabel="Simpan"
        busy={rolesMutation.isPending}
        onClose={() => setRolesRow(null)}
        onConfirm={() => rolesMutation.mutate()}
      >
        <div className="mt-3">{roleCheckboxes(selectedRoleIds, setSelectedRoleIds)}</div>
      </ConfirmDialog>
    </div>
  );
}
