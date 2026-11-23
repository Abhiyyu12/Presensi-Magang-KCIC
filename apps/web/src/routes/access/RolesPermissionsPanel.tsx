import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { asString, isRecord, type Paginated } from '../../lib/types';
import { LoadingState } from '../../components/LoadingState';
import { ErrorState } from '../../components/ErrorState';
import { EmptyState } from '../../components/EmptyState';
import { ConfirmDialog } from '../../components/ConfirmDialog';

type Row = Record<string, unknown>;

interface PermissionEntry {
  permissionCode: string;
  effect: 'ALLOW' | 'DENY';
}

interface TreePermission {
  code: string;
  description: string | null;
  action: string;
}

interface TreeSubmenu {
  key: string;
  label: string;
  permissions: TreePermission[];
}

interface TreeMenu {
  key: string;
  label: string;
  submenus: TreeSubmenu[];
}

interface RoleTemplateItem {
  key: string;
  name: string;
  description: string;
  permissionCount: number;
}

const nodeKey = (menu: string, submenu: string) => `${menu}/${submenu}`;

function matchesSearch(p: TreePermission, q: string): boolean {
  const haystack = `${p.code} ${p.description ?? ''}`.toLowerCase();
  return haystack.includes(q);
}

/** Checkbox yang mendukung kondisi sebagian tercentang (indeterminate). */
function TriCheckbox({
  checked,
  indeterminate,
  ariaLabel,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  ariaLabel: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      className="h-4 w-4 rounded border-stone-300"
      checked={checked}
      aria-label={ariaLabel}
      ref={(el) => {
        if (el) el.indeterminate = indeterminate;
      }}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}

export function RolesPermissionsPanel() {
  const queryClient = useQueryClient();
  const [roleId, setRoleId] = useState<string>('');
  const [allowed, setAllowed] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [templateApply, setTemplateApply] = useState<RoleTemplateItem | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);

  const rolesQuery = useQuery({
    queryKey: ['access', 'roles'],
    queryFn: () => api<Paginated<Row>>('/admin/access/roles', { query: { pageSize: 100 } }),
  });

  const treeQuery = useQuery({
    queryKey: ['access', 'permission-tree'],
    queryFn: () => api<{ menus: TreeMenu[] }>('/admin/access/permission-tree'),
  });

  const templatesQuery = useQuery({
    queryKey: ['access', 'role-templates'],
    queryFn: () => api<{ items: RoleTemplateItem[] }>('/admin/access/role-templates'),
  });

  const roleDetailQuery = useQuery({
    queryKey: ['access', 'role', roleId],
    queryFn: () => api<Row>(`/admin/access/roles/${roleId}`),
    enabled: Boolean(roleId),
  });

  // Reset status simpan hanya saat berganti role, bukan saat detail di-refetch,
  // supaya pesan sukses tidak hilang seketika setelah invalidasi query.
  useEffect(() => {
    setSaveOk(false);
    setSaveError(null);
    setTemplateError(null);
  }, [roleId]);

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
  }, [roleDetailQuery.data, roleId]);

  const menus = treeQuery.data?.menus ?? [];

  const allCodes = useMemo(
    () => menus.flatMap((m) => m.submenus.flatMap((s) => s.permissions.map((p) => p.code))),
    [menus],
  );

  const q = search.trim().toLowerCase();
  const visibleMenus = useMemo(() => {
    if (!q) return menus;
    return menus
      .map((m) => ({
        ...m,
        submenus: m.submenus
          .map((s) => ({ ...s, permissions: s.permissions.filter((p) => matchesSearch(p, q)) }))
          .filter((s) => s.permissions.length > 0),
      }))
      .filter((m) => m.submenus.length > 0);
  }, [menus, q]);

  // Saat mencari, semua grup yang cocok langsung terbuka.
  useEffect(() => {
    if (!q) return;
    const keys = visibleMenus.flatMap((m) => m.submenus.map((s) => nodeKey(m.key, s.key)));
    setExpanded(new Set(keys));
  }, [q, visibleMenus]);

  const toggleNode = (keys: string[], on: boolean) => {
    setAllowed((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      // PUT mengganti penuh set permission role: centang = ALLOW, sisanya dihapus.
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

  const applyTemplateMutation = useMutation({
    mutationFn: (template: RoleTemplateItem) =>
      api<unknown>(`/admin/access/roles/${roleId}/apply-template`, {
        method: 'POST',
        body: { templateKey: template.key },
      }),
    onSuccess: () => {
      setTemplateError(null);
      setTemplateApply(null);
      setSaveOk(false);
      void queryClient.invalidateQueries({ queryKey: ['access', 'role', roleId] });
    },
    onError: (error: unknown) => {
      setTemplateApply(null);
      setTemplateError(error instanceof ApiError ? error.message : 'Gagal menerapkan template.');
    },
  });

  if (rolesQuery.isLoading || treeQuery.isLoading) return <LoadingState />;
  if (rolesQuery.isError) {
    return (
      <ErrorState
        message={rolesQuery.error instanceof Error ? rolesQuery.error.message : 'Gagal memuat.'}
        onRetry={() => void rolesQuery.refetch()}
      />
    );
  }
  if (treeQuery.isError) {
    return (
      <ErrorState
        message={treeQuery.error instanceof Error ? treeQuery.error.message : 'Gagal memuat pohon permission.'}
        onRetry={() => void treeQuery.refetch()}
      />
    );
  }

  const roles = (rolesQuery.data?.items ?? []).filter(isRecord);

  const expandAll = () => setExpanded(new Set(menus.flatMap((m) => m.submenus.map((s) => nodeKey(m.key, s.key)))));
  const collapseAll = () => setExpanded(new Set());

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
        {roleId && (templatesQuery.data?.items ?? []).length > 0 ? (
          <div className="mt-3 border-t border-stone-100 pt-3">
            <p className="text-xs font-semibold uppercase text-stone-500">Isi cepat dengan template</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(templatesQuery.data?.items ?? []).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className="btn-secondary px-3 py-1.5 text-xs"
                  disabled={applyTemplateMutation.isPending}
                  onClick={() => setTemplateApply(t)}
                  title={t.description}
                >
                  {t.name} ({t.permissionCount})
                </button>
              ))}
            </div>
            {templateError ? (
              <p className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{templateError}</p>
            ) : null}
          </div>
        ) : null}
      </div>

      {roleId ? (
        <div className="card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-stone-800">
              Pohon permission (centang = boleh, kosong = tidak boleh)
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => toggleNode(allCodes, true)}>
                Pilih semua
              </button>
              <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => toggleNode(allCodes, false)}>
                Kosongkan
              </button>
              <button type="button" className="btn-primary" disabled={saveMutation.isPending || roleDetailQuery.isLoading} onClick={() => saveMutation.mutate()}>
                {saveMutation.isPending ? 'Menyimpan…' : 'Simpan Permission'}
              </button>
            </div>
          </div>
          {saveOk ? (
            <p className="mt-2 rounded-lg bg-green-50 p-2 text-sm text-green-700" role="status">
              Permission berhasil disimpan. Cache akses diinvalidasi oleh server.
            </p>
          ) : null}
          {saveError ? (
            <p className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{saveError}</p>
          ) : null}
          {roleDetailQuery.isLoading ? <LoadingState label="Memuat permission role…" /> : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="search"
              className="input max-w-xs min-h-touch"
              placeholder="Cari permission…"
              aria-label="Cari permission"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {q ? null : (
              <>
                <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={expandAll}>
                  Buka semua
                </button>
                <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={collapseAll}>
                  Tutup semua
                </button>
              </>
            )}
            <span className="text-xs text-stone-500">{allowed.size} dari {allCodes.length} permission dipilih</span>
          </div>

          <div className="mt-3 space-y-2">
            {visibleMenus.map((menu) => {
              const menuCodes = menu.submenus.flatMap((s) => s.permissions.map((p) => p.code));
              const menuOn = menuCodes.every((c) => allowed.has(c));
              const menuSome = menuCodes.some((c) => allowed.has(c));
              const menuOpen = q !== '' || expanded.has(menu.key);
              return (
                <section key={menu.key} className="rounded-lg border border-stone-200">
                  <div className="flex items-center gap-2 bg-stone-50 px-3 py-2">
                    <button
                      type="button"
                      className="text-stone-500 hover:text-stone-800"
                      aria-expanded={menuOpen}
                      aria-label={`${menuOpen ? 'Tutup' : 'Buka'} menu ${menu.label}`}
                      onClick={() =>
                        setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(menu.key)) next.delete(menu.key);
                          else next.add(menu.key);
                          return next;
                        })
                      }
                    >
                      <svg viewBox="0 0 24 24" className={`h-4 w-4 transition-transform ${menuOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                        <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <TriCheckbox
                      checked={menuOn}
                      indeterminate={menuSome && !menuOn}
                      ariaLabel={`Pilih semua permission menu ${menu.label}`}
                      onChange={(on) => toggleNode(menuCodes, on)}
                    />
                    <span className="text-sm font-semibold text-stone-800">{menu.label}</span>
                    <span className="text-xs text-stone-400">{menuCodes.filter((c) => allowed.has(c)).length}/{menuCodes.length}</span>
                  </div>
                  {menuOpen ? (
                    <div className="divide-y divide-stone-100">
                      {menu.submenus.map((submenu) => {
                        const subCodes = submenu.permissions.map((p) => p.code);
                        const subOn = subCodes.every((c) => allowed.has(c));
                        const subSome = subCodes.some((c) => allowed.has(c));
                        const subKey = nodeKey(menu.key, submenu.key);
                        const subOpen = q !== '' || expanded.has(subKey);
                        return (
                          <div key={subKey} className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                className="text-stone-400 hover:text-stone-700"
                                aria-expanded={subOpen}
                                aria-label={`${subOpen ? 'Tutup' : 'Buka'} submenu ${submenu.label}`}
                                onClick={() =>
                                  setExpanded((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(subKey)) next.delete(subKey);
                                    else next.add(subKey);
                                    return next;
                                  })
                                }
                              >
                                <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 transition-transform ${subOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                                  <path d="m9 5 7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </button>
                              <TriCheckbox
                                checked={subOn}
                                indeterminate={subSome && !subOn}
                                ariaLabel={`Pilih semua permission submenu ${submenu.label}`}
                                onChange={(on) => toggleNode(subCodes, on)}
                              />
                              <span className="text-sm font-medium text-stone-700">{submenu.label}</span>
                            </div>
                            {subOpen ? (
                              <ul className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1 pl-7 sm:grid-cols-2 lg:grid-cols-3">
                                {submenu.permissions.map((p) => (
                                  <li key={p.code}>
                                    <label className="flex items-start gap-2 rounded px-1 py-0.5 text-sm text-stone-700 hover:bg-stone-50">
                                      <input
                                        type="checkbox"
                                        className="mt-0.5 h-4 w-4 rounded border-stone-300"
                                        checked={allowed.has(p.code)}
                                        aria-label={`ALLOW ${p.code}`}
                                        onChange={(e) =>
                                          setAllowed((prev) => {
                                            const next = new Set(prev);
                                            if (e.target.checked) next.add(p.code);
                                            else next.delete(p.code);
                                            return next;
                                          })
                                        }
                                      />
                                      <span>
                                        <span className="block font-mono text-xs text-stone-800">{p.code}</span>
                                        {p.description ? (
                                          <span className="block text-xs text-stone-500">{p.description}</span>
                                        ) : null}
                                      </span>
                                    </label>
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              );
            })}
            {visibleMenus.length === 0 ? (
              <p className="text-sm text-stone-500">Tidak ada permission yang cocok dengan pencarian.</p>
            ) : null}
          </div>
        </div>
      ) : (
        <EmptyState
          title="Pilih role dahulu"
          description="Pilih salah satu role di atas untuk melihat dan mengubah permission-nya."
        />
      )}

      <ConfirmDialog
        open={Boolean(templateApply)}
        title={`Terapkan template "${templateApply?.name ?? ''}"`}
        description={
          templateApply
            ? `Semua permission role ini akan DIGANTI sesuai template ${templateApply.name} (${templateApply.permissionCount} permission). Lanjutkan?`
            : ''
        }
        confirmLabel="Ya, Terapkan"
        busy={applyTemplateMutation.isPending}
        onConfirm={() => templateApply && applyTemplateMutation.mutate(templateApply)}
        onClose={() => setTemplateApply(null)}
      />
    </div>
  );
}
