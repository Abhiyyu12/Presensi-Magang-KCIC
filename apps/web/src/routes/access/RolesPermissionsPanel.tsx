import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { asString, isRecord, type Paginated } from '../../lib/types';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';

type Row = Record<string, unknown>;

interface PermissionEntry {
  permissionCode: string;
  effect: 'ALLOW' | 'DENY';
}

export function RolesPermissionsPanel() {
  const queryClient = useQueryClient();
  const [roleId, setRoleId] = useState<string>('');
  const [allowed, setAllowed] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  const rolesQuery = useQuery({
    queryKey: ['access', 'roles'],
    queryFn: () => api<Paginated<Row>>('/admin/access/roles', { query: { pageSize: 100 } }),
  });

  const permissionsQuery = useQuery({
    queryKey: ['access', 'permissions'],
    queryFn: () => api<Paginated<Row>>('/admin/access/permissions', { query: { pageSize: 100 } }),
  });

  const roleDetailQuery = useQuery({
    queryKey: ['access', 'role', roleId],
    queryFn: () => api<Row>(`/admin/access/roles/${roleId}`),
    enabled: Boolean(roleId),
  });

  useEffect(() => {
    const detail = roleDetailQuery.data;
    if (!roleId || !detail) return;
    const next = new Set<string>();
    const entriesRaw = detail['permissions'] ?? detail['entries'];
    if (Array.isArray(entriesRaw)) {
      for (const entry of entriesRaw) {
        if (!isRecord(entry)) {
          if (typeof entry === 'string') next.add(entry);
          continue;
        }
        const code = asString(entry['permissionCode'] ?? entry['code'], '');
        const effect = asString(entry['effect'], 'ALLOW');
        if (code && effect === 'ALLOW') next.add(code);
      }
    }
    setAllowed(next);
    setSaveOk(false);
    setSaveError(null);
  }, [roleDetailQuery.data, roleId]);

  const saveMutation = useMutation({
    mutationFn: () => {
      // PUT replaces the role's permission set: checked boxes become ALLOW
      // entries; unchecked permissions are simply omitted.
      const entries: PermissionEntry[] = Array.from(allowed)
        .sort()
        .map((code) => ({ permissionCode: code, effect: 'ALLOW' as const }));
      return api<unknown>(`/admin/access/roles/${roleId}/permissions`, {
        method: 'PUT',
        body: { entries },
      });
    },
    onSuccess: () => {
      setSaveError(null);
      setSaveOk(true);
      void queryClient.invalidateQueries({ queryKey: ['access', 'role', roleId] });
    },
    onError: (error: unknown) => {
      setSaveOk(false);
      setSaveError(error instanceof ApiError ? error.message : 'Gagal menyimpan permission.');
    },
  });

  if (rolesQuery.isLoading || permissionsQuery.isLoading) return <LoadingState />;
  if (rolesQuery.isError) {
    return (
      <ErrorState
        message={rolesQuery.error instanceof Error ? rolesQuery.error.message : 'Gagal memuat.'}
        onRetry={() => void rolesQuery.refetch()}
      />
    );
  }

  const roles = (rolesQuery.data?.items ?? []).filter(isRecord);
  const permissions = (permissionsQuery.data?.items ?? [])
    .filter(isRecord)
    .map((p) => asString(p['code'] ?? p['permissionCode'], ''))
    .filter(Boolean)
    .sort();

  return (
    <div className="space-y-4">
      <div className="card">
        <label className="label" htmlFor="access-role-select">
          Pilih role
        </label>
        <select
          id="access-role-select"
          className="input max-w-sm"
          value={roleId}
          onChange={(e) => setRoleId(e.target.value)}
        >
          <option value="">— Pilih role —</option>
          {roles.map((role) => (
            <option key={asString(role['id'])} value={asString(role['id'])}>
              {asString(role['name'] ?? role['code'])}
              {role['code'] ? ` (${asString(role['code'])})` : ''}
            </option>
          ))}
        </select>
      </div>

      {roleId ? (
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800">
              Permission role (centang = ALLOW, tidak dicentang = DENY)
            </h2>
            <button
              type="button"
              className="btn-primary"
              disabled={saveMutation.isPending || roleDetailQuery.isLoading}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? 'Menyimpan…' : 'Simpan Permission'}
            </button>
          </div>
          {saveOk ? (
            <p className="mt-2 rounded-lg bg-green-50 p-2 text-sm text-green-700" role="status">
              Permission berhasil disimpan. Cache akses diinvalidasi oleh server.
            </p>
          ) : null}
          {saveError ? (
            <p className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">
              {saveError}
            </p>
          ) : null}
          {roleDetailQuery.isLoading ? <LoadingState label="Memuat permission role…" /> : null}
          <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {permissions.map((code) => (
              <label key={code} className="flex items-center gap-2 rounded px-1 py-0.5 text-sm text-slate-700 hover:bg-slate-50">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={allowed.has(code)}
                  aria-label={`ALLOW ${code}`}
                  onChange={(e) =>
                    setAllowed((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(code);
                      else next.delete(code);
                      return next;
                    })
                  }
                />
                <span className="font-mono text-xs">{code}</span>
              </label>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Pilih role untuk melihat dan mengubah permission.</p>
      )}
    </div>
  );
}
