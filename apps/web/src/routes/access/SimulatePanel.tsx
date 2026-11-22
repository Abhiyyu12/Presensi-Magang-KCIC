import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { asString, isRecord, type Paginated } from '../../lib/types';
import { FormField } from '../../components/FormField';

type Row = Record<string, unknown>;

interface SimulateResult {
  allowed: boolean;
  reason?: string;
}

export function SimulatePanel() {
  const [userId, setUserId] = useState('');
  const [permissionCode, setPermissionCode] = useState('');
  const [submitted, setSubmitted] = useState<{ userId: string; permissionCode: string } | null>(null);

  const usersQuery = useQuery({
    queryKey: ['master', 'users', 'simulate-list'],
    queryFn: () => api<Paginated<Row>>('/admin/users', { query: { pageSize: 100 } }),
    retry: false,
  });

  const permissionsQuery = useQuery({
    queryKey: ['access', 'permissions'],
    queryFn: () => api<Paginated<Row>>('/admin/access/permissions', { query: { pageSize: 100 } }),
  });

  const simulateQuery = useQuery({
    queryKey: ['access', 'simulate', submitted],
    queryFn: () =>
      api<unknown>('/admin/access/simulate', {
        query: { userId: submitted?.userId, permissionCode: submitted?.permissionCode },
      }),
    enabled: Boolean(submitted?.userId && submitted?.permissionCode),
  });

  const result: SimulateResult | null = (() => {
    const raw = simulateQuery.data;
    if (!submitted || raw === undefined) return null;
    if (typeof raw === 'boolean') return { allowed: raw };
    if (isRecord(raw)) {
      return {
        allowed: raw['allowed'] === true,
        reason: typeof raw['reason'] === 'string' ? raw['reason'] : undefined,
      };
    }
    return { allowed: false };
  })();

  const permissions = (permissionsQuery.data?.items ?? [])
    .filter(isRecord)
    .map((p) => asString(p['code'] ?? p['permissionCode'], ''))
    .filter(Boolean)
    .sort();

  return (
    <div className="space-y-4">
      <div className="card border-brand-200 bg-brand-50">
        <p className="text-sm text-brand-900">
          <strong>Simulasi bersifat diagnostik, tidak memberi akses.</strong> Hasil hanya untuk
          membantu administrator memahami evaluasi permission efektif.
        </p>
      </div>

      <form
        className="card grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (userId && permissionCode) setSubmitted({ userId, permissionCode });
        }}
        aria-label="Simulasi permission efektif"
      >
        <FormField label="Pengguna" required>
          {(props) => (
            <select
              {...props}
              className="input"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              disabled={usersQuery.isError || usersQuery.isLoading}
            >
              <option value="">— Pilih pengguna —</option>
              {(usersQuery.data?.items ?? []).filter(isRecord).map((user) => (
                <option key={asString(user['id'])} value={asString(user['id'])}>
                  {asString(user['displayName'])} ({asString(user['username'])})
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="Permission" required>
          {(props) => (
            <select
              {...props}
              className="input"
              value={permissionCode}
              onChange={(e) => setPermissionCode(e.target.value)}
            >
              <option value="">— Pilih permission —</option>
              {permissions.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <button type="submit" className="btn-primary" disabled={simulateQuery.isFetching}>
          {simulateQuery.isFetching ? 'Memeriksa…' : 'Simulasikan'}
        </button>
      </form>

      {result ? (
        <div
          className={`card ${result.allowed ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}
          role="status"
          aria-live="polite"
        >
          <p className={`text-sm font-semibold ${result.allowed ? 'text-green-800' : 'text-red-800'}`}>
            Hasil: {result.allowed ? 'allowed = true' : 'allowed = false'}
          </p>
          {result.reason ? (
            <p className={`mt-1 text-sm ${result.allowed ? 'text-green-700' : 'text-red-700'}`}>
              {result.reason}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-slate-500">
            Diagnostik, tidak memberi akses. Keputusan sebenarnya tetap dievaluasi server pada
            setiap request.
          </p>
        </div>
      ) : null}
    </div>
  );
}
