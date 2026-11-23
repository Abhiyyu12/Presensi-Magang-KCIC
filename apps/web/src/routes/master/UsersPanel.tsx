import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, firstFieldErrorMessage } from '../../lib/api';
import { asString, isRecord, type Paginated } from '../../lib/types';
import { DataTable, type Column } from '../../components/DataTable';
import { ErrorState } from '../../components/ErrorState';
import { ServerPagination } from '../../components/ServerPagination';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ImportUsersDialog } from './ImportUsersDialog';
import { SuccessNotice } from '../../components/SuccessNotice';
import { StatusBadge } from '../../components/StatusBadge';
import { FetchIndicator } from '../../components/FetchIndicator';
import { MasterCombobox } from '../../components/MasterCombobox';
import { Icon } from '../../components/Icon';
import { useAuth } from '../../lib/auth';
import { usePagedFilters } from '../../hooks/useUiHelpers';
import { fetchBureauOptions, fetchDivisionOptions, fetchPlacementOptions, fetchUserOptions } from './options';

type Row = Record<string, unknown>;

interface RoleRow {
  id: string;
  code?: string;
  name?: string;
}

const ACCOUNT_STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Aktif' },
  { value: 'INACTIVE', label: 'Nonaktif' },
  { value: 'SUSPENDED', label: 'Ditangguhkan' },
];

const INTERN_STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Aktif' },
  { value: 'COMPLETED', label: 'Selesai' },
  { value: 'WITHDRAWN', label: 'Mengundurkan diri' },
];

const datePart = (value: unknown): string => (typeof value === 'string' ? value.slice(0, 10) : '');

interface ProfileFormState {
  asIntern: boolean;
  participantNumber: string;
  bureauId: string;
  bureauLabel: string;
  divisionId: string;
  divisionLabel: string;
  placementId: string;
  placementLabel: string;
  startDate: string;
  endDate: string;
  internStatus: string;
}

const EMPTY_PROFILE: ProfileFormState = {
  asIntern: false,
  participantNumber: '',
  bureauId: '',
  bureauLabel: '',
  divisionId: '',
  divisionLabel: '',
  placementId: '',
  placementLabel: '',
  startDate: '',
  endDate: '',
  internStatus: 'ACTIVE',
};

function profileFromRow(profile: Row | undefined): ProfileFormState {
  if (!profile) return { ...EMPTY_PROFILE };
  const bureau = isRecord(profile['bureau']) ? profile['bureau'] : undefined;
  const division = isRecord(profile['division']) ? profile['division'] : undefined;
  const placement = isRecord(profile['placement']) ? profile['placement'] : undefined;
  return {
    asIntern: true,
    participantNumber: asString(profile['participantNumber'], ''),
    bureauId: asString(bureau?.['id'], ''),
    bureauLabel: asString(bureau?.['name'], ''),
    divisionId: asString(division?.['id'], ''),
    divisionLabel: asString(division?.['name'], ''),
    placementId: asString(placement?.['id'], ''),
    placementLabel: asString(placement?.['name'], ''),
    startDate: datePart(profile['startDate']),
    endDate: datePart(profile['endDate']),
    internStatus: asString(profile['status'], 'ACTIVE'),
  };
}

function profilePayload(f: ProfileFormState): Row {
  const payload: Row = {
    participantNumber: f.participantNumber.trim(),
    bureauId: f.bureauId,
    divisionId: f.divisionId || null,
    placementId: f.placementId || null,
    status: f.internStatus,
  };
  // Field tanggal dikosongkan saat edit = tetap seperti sebelumnya, bukan menghapus.
  if (f.startDate) payload['startDate'] = f.startDate;
  if (f.endDate) payload['endDate'] = f.endDate;
  return payload;
}

function validateProfileForm(f: ProfileFormState, creating: boolean): string | null {
  if (!f.asIntern) return null;
  if (creating || f.participantNumber === '') {
    if (!f.participantNumber.trim()) return 'Nomor peserta wajib diisi untuk peserta magang.';
    if (!f.bureauId) return 'Direktorat wajib dipilih untuk peserta magang.';
    if (!f.startDate) return 'Tanggal mulai magang wajib diisi untuk peserta magang.';
  }
  if (f.startDate && f.endDate && f.endDate < f.startDate) {
    return 'Tanggal selesai magang tidak boleh sebelum tanggal mulai.';
  }
  return null;
}

export function UsersPanel() {
  const queryClient = useQueryClient();
  const { has } = useAuth();
  const { page, setPage, pageSize, setPageSize } = usePagedFilters({}, 10);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [bureauId, setBureauId] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [rolesRow, setRolesRow] = useState<Row | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [createForm, setCreateForm] = useState({
    username: '',
    displayName: '',
    password: '',
    email: '',
    phone: '',
    roleIds: [] as string[],
    profile: { ...EMPTY_PROFILE },
  });
  const [editForm, setEditForm] = useState({
    displayName: '',
    email: '',
    phone: '',
    accountStatus: 'ACTIVE',
    profile: { ...EMPTY_PROFILE },
  });
  const [editPassword, setEditPassword] = useState('');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editHadProfile, setEditHadProfile] = useState(false);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [supervisorId, setSupervisorId] = useState('');
  const [supervisorLabel, setSupervisorLabel] = useState('');
  const [assignError, setAssignError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [searchInput, setPage]);

  useEffect(() => {
    setDivisionId('');
  }, [bureauId]);

  const usersQuery = useQuery({
    queryKey: ['master', 'users', page, pageSize, search, roleFilter, bureauId, divisionId, statusFilter],
    queryFn: () =>
      api<Paginated<Row>>('/admin/users', {
        query: {
          page: String(page),
          pageSize: String(pageSize),
          ...(search ? { search } : {}),
          ...(roleFilter ? { roleCode: roleFilter } : {}),
          ...(bureauId ? { bureauId } : {}),
          ...(divisionId ? { divisionId } : {}),
          ...(statusFilter ? { accountStatus: statusFilter } : {}),
        },
      }),
    placeholderData: (previous) => previous,
  });

  const rolesQuery = useQuery({
    queryKey: ['master', 'roles-catalog'],
    queryFn: () => api<{ items: RoleRow[] }>('/admin/roles'),
  });

  const bureausQuery = useQuery({
    queryKey: ['master', 'bureau-catalog'],
    queryFn: () => api<Paginated<Row>>('/admin/organizations/bureaus', { query: { pageSize: '100' } }),
    staleTime: 60_000,
  });

  const divisionsQuery = useQuery({
    queryKey: ['master', 'division-catalog', bureauId],
    enabled: bureauId !== '',
    queryFn: () =>
      api<Paginated<Row>>('/admin/organizations/divisions', { query: { pageSize: '100', bureauId } }),
    staleTime: 60_000,
  });

  const detailQuery = useQuery({
    queryKey: ['master', 'user-detail', detailId],
    enabled: detailId !== null,
    queryFn: () => api<Row>(`/admin/users/${detailId}`),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['master', 'users'] });
  const invalidateDetail = () => {
    if (detailId) void queryClient.invalidateQueries({ queryKey: ['master', 'user-detail', detailId] });
    invalidate();
  };

  const createMutation = useMutation({
    mutationFn: () => {
      if (!createForm.username.trim() || !createForm.displayName.trim() || !createForm.password) {
        throw new ApiError('VALIDATION', 'Username, nama tampilan, dan kata sandi wajib diisi.', 400);
      }
      if (createForm.password.length < 10) {
        throw new ApiError('VALIDATION', 'Kata sandi minimal 10 karakter.', 400);
      }
      if (createForm.roleIds.length === 0) {
        throw new ApiError('VALIDATION', 'Pilih minimal satu role.', 400);
      }
      const profileError = validateProfileForm(createForm.profile, true);
      if (profileError) throw new ApiError('VALIDATION', profileError, 400);
      return api<Row>('/admin/users', {
        method: 'POST',
        body: {
          username: createForm.username.trim(),
          displayName: createForm.displayName.trim(),
          password: createForm.password,
          ...(createForm.email ? { email: createForm.email } : {}),
          ...(createForm.phone ? { phone: createForm.phone } : {}),
          roleIds: createForm.roleIds,
          ...(createForm.profile.asIntern ? { internProfile: profilePayload(createForm.profile) } : {}),
        },
      });
    },
    onSuccess: () => {
      setCreateOpen(false);
      setFormError(null);
      setNotice('Pengguna baru berhasil dibuat.');
      setCreateForm({
        username: '', displayName: '', password: '', email: '', phone: '',
        roleIds: [], profile: { ...EMPTY_PROFILE },
      });
      invalidate();
    },
    onError: (error: unknown) => {
      setFormError((error instanceof ApiError && (firstFieldErrorMessage(error.fieldErrors) ?? error.message)) || 'Gagal membuat pengguna.');
    },
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      const profileError = validateProfileForm(editForm.profile, !editHadProfile);
      if (profileError) throw new ApiError('VALIDATION', profileError, 400);
      if (editPassword && editPassword.length < 10) {
        throw new ApiError('VALIDATION', 'Kata sandi baru minimal 10 karakter.', 400);
      }
      const saved = await api<Row>(`/admin/users/${asString(editRow?.['id'])}`, {
        method: 'PATCH',
        body: {
          displayName: editForm.displayName || undefined,
          email: editForm.email || undefined,
          phone: editForm.phone || undefined,
          accountStatus: editForm.accountStatus,
          ...(editForm.profile.asIntern ? { internProfile: profilePayload(editForm.profile) } : {}),
        },
      });
      if (editPassword) {
        await api<unknown>(`/admin/users/${asString(editRow?.['id'])}/password`, {
          method: 'PATCH',
          body: { password: editPassword },
        });
      }
      return saved;
    },
    onSuccess: () => {
      setEditRow(null);
      setFormError(null);
      setNotice(
        editPassword
          ? 'Perubahan disimpan. Kata sandi baru aktif dan semua sesi lama pengguna telah dicabut.'
          : 'Perubahan data pengguna disimpan.',
      );
      setEditPassword('');
      setShowEditPassword(false);
      invalidate();
    },
    onError: (error: unknown) => {
      setFormError((error instanceof ApiError && (firstFieldErrorMessage(error.fieldErrors) ?? error.message)) || 'Gagal memperbarui pengguna.');
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
      setFormError((error instanceof ApiError && (firstFieldErrorMessage(error.fieldErrors) ?? error.message)) || 'Gagal mengubah role.');
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
      setFormError((error instanceof ApiError && (firstFieldErrorMessage(error.fieldErrors) ?? error.message)) || 'Gagal membuat token reset.');
    },
  });

  const assignMutation = useMutation({
    mutationFn: () => {
      const profile = isRecord(detailQuery.data?.['internProfile']) ? detailQuery.data?.['internProfile'] : undefined;
      const internProfileId = asString(profile?.['id'], '');
      if (!internProfileId) throw new ApiError('VALIDATION', 'Pengguna belum terdaftar sebagai peserta.', 400);
      if (!supervisorId) throw new ApiError('VALIDATION', 'Pilih pembimbing terlebih dahulu.', 400);
      return api<Row>('/admin/assignments', {
        method: 'POST',
        body: { supervisorUserId: supervisorId, internProfileId, status: 'ACTIVE' },
      });
    },
    onSuccess: () => {
      setSupervisorId('');
      setSupervisorLabel('');
      setAssignError(null);
      setNotice('Pembimbing berhasil ditugaskan.');
      invalidateDetail();
    },
    onError: (error: unknown) => {
      setAssignError(error instanceof ApiError ? error.message : 'Gagal menugaskan pembimbing.');
    },
  });

  const roles = rolesQuery.data?.items ?? [];
  const roleFilterOptions = roles;
  const bureaus = (bureausQuery.data?.items ?? []).filter(isRecord);
  const divisions = (divisionsQuery.data?.items ?? []).filter(isRecord);

  const columns: Column<Row>[] = [
    { header: 'Username', cell: (row) => asString(row['username']) },
    { header: 'Nama tampilan', cell: (row) => asString(row['displayName']) },
    { header: 'Email', cell: (row) => asString(row['email']) || '-' },
    {
      header: 'Role',
      cell: (row) => {
        const codes = Array.isArray(row['roles'])
          ? (row['roles'] as unknown[])
              .map((r) => (isRecord(r) ? asString(r['code'] ?? r['name']) : String(r)))
              .filter(Boolean)
          : [];
        return codes.length > 0 ? (
          <span className="flex flex-wrap items-center gap-1">
            {codes.map((code) => (
              <span
                key={code}
                className="inline-flex items-center whitespace-nowrap rounded-full border border-stone-200 bg-stone-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-stone-700"
              >
                {code}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-stone-300">-</span>
        );
      },
    },
    {
      header: 'No. Peserta',
      cell: (row) => {
        const profile = isRecord(row['internProfile']) ? row['internProfile'] : undefined;
        return profile ? asString(profile['participantNumber'], '-') : '-';
      },
    },
    {
      header: 'Direktorat / Biro',
      cell: (row) => {
        const profile = isRecord(row['internProfile']) ? row['internProfile'] : undefined;
        if (!profile) return '-';
        const bureau = isRecord(profile['bureau']) ? asString(profile['bureau']['name'], '-') : '-';
        const division = isRecord(profile['division']) ? asString(profile['division']['name'], '') : '';
        return division ? `${bureau} / ${division}` : bureau;
      },
    },
    {
      header: 'Status',
      cell: (row) => {
        const status = asString(row['accountStatus'], 'ACTIVE');
        return <StatusBadge kind="neutral" status={status} label={ACCOUNT_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status} />;
      },
    },
    {
      header: 'Aksi',
      cell: (row) => (
        <span className="flex items-center gap-1">
          <button
            type="button"
            className="btn-icon"
            aria-label={`Detail pengguna ${asString(row['username'])}`}
            title="Lihat detail"
            onClick={() => {
              setDetailId(asString(row['id'], '') || null);
              setSupervisorId('');
              setSupervisorLabel('');
              setAssignError(null);
            }}
          >
            <Icon name="eye" />
          </button>
          <button
            type="button"
            className="btn-icon"
            aria-label={`Ubah pengguna ${asString(row['username'])}`}
            title="Ubah pengguna"
            onClick={() => {
              setEditRow(row);
              setEditHadProfile(isRecord(row['internProfile']));
              setEditForm({
                displayName: asString(row['displayName'], ''),
                email: asString(row['email'], ''),
                phone: asString(row['phone'], ''),
                accountStatus: asString(row['accountStatus'], 'ACTIVE'),
                profile: profileFromRow(isRecord(row['internProfile']) ? row['internProfile'] : undefined),
              });
              setEditPassword('');
              setShowEditPassword(false);
              setFormError(null);
            }}
          >
            <Icon name="pencil" />
          </button>
          <button
            type="button"
            className="btn-icon"
            aria-label={`Atur role pengguna ${asString(row['username'])}`}
            title="Atur role"
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
            <Icon name="shield" />
          </button>
          <button
            type="button"
            className="btn-icon"
            aria-label={`Token reset kata sandi ${asString(row['username'])}`}
            title="Token reset kata sandi"
            disabled={resetMutation.isPending}
            onClick={() => resetMutation.mutate(row)}
          >
            <Icon name="key" />
          </button>
        </span>
      ),
    },
  ];

  const createBodyRef = useRef<HTMLDivElement>(null);
  const createInternRef = useRef<HTMLDivElement>(null);
  const editBodyRef = useRef<HTMLDivElement>(null);
  const editInternRef = useRef<HTMLDivElement>(null);
  // Seksi "Data peserta magang" muncul di bawah lipatan dialog saat dicentang —
  // gulirkan otomatis agar inputannya langsung terlihat.
  const scrollToInternFields = (body: HTMLDivElement | null, section: HTMLDivElement | null) => {
    if (!body || !section) return;
    const top = body.scrollTop + section.getBoundingClientRect().top - body.getBoundingClientRect().top - 8;
    body.scrollTo({ top, behavior: 'smooth' });
  };

  const roleCheckboxes = (selected: string[], onChange: (ids: string[]) => void) => (
    <fieldset className="space-y-1">
      <legend className="label">Role<span className="ml-0.5 text-red-600">*</span></legend>
      {roles.map((role) => (
        <label key={role.id} className="flex items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-stone-300"
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
          {role.code ? <span className="text-xs text-stone-400">({role.code})</span> : null}
        </label>
      ))}
    </fieldset>
  );

  const profileFields = (
    f: ProfileFormState,
    set: (next: ProfileFormState) => void,
  ) => (
    <div className="mt-3 space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Data peserta magang</p>
      <div>
        <label className="label" htmlFor="profile-participant-number">Nomor peserta<span className="ml-0.5 text-red-600">*</span></label>
        <input
          id="profile-participant-number"
          className="input"
          value={f.participantNumber}
          onChange={(e) => set({ ...f, participantNumber: e.target.value })}
        />
      </div>
      <MasterCombobox
        id="profile-bureau"
        label="Direktorat"
        required
        value={f.bureauId}
        valueLabel={f.bureauLabel}
        allowClear
        fetchOptions={fetchBureauOptions}
        onChange={(value, label) => set({ ...f, bureauId: value, bureauLabel: label, divisionId: '', divisionLabel: '' })}
      />
      <MasterCombobox
        id="profile-division"
        label="Biro"
        value={f.divisionId}
        valueLabel={f.divisionLabel}
        allowClear
        queryExtra={f.bureauId || null}
        depHint="Pilih direktorat terlebih dahulu."
        fetchOptions={(s) => fetchDivisionOptions(s, f.bureauId)}
        onChange={(value, label) => set({ ...f, divisionId: value, divisionLabel: label })}
      />
      <MasterCombobox
        id="profile-placement"
        label="Penempatan"
        value={f.placementId}
        valueLabel={f.placementLabel}
        allowClear
        fetchOptions={fetchPlacementOptions}
        onChange={(value, label) => set({ ...f, placementId: value, placementLabel: label })}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="profile-start">Tanggal mulai<span className="ml-0.5 text-red-600">*</span></label>
          <input
            id="profile-start"
            type="date"
            className="input"
            value={f.startDate}
            onChange={(e) => set({ ...f, startDate: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="profile-end">Tanggal selesai</label>
          <input
            id="profile-end"
            type="date"
            className="input"
            value={f.endDate}
            onChange={(e) => set({ ...f, endDate: e.target.value })}
          />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="profile-status">Status magang</label>
        <select
          id="profile-status"
          className="input"
          value={f.internStatus}
          onChange={(e) => set({ ...f, internStatus: e.target.value })}
        >
          {INTERN_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    </div>
  );

  const detail = isRecord(detailQuery.data) ? detailQuery.data : null;
  const detailProfile = detail && isRecord(detail['internProfile']) ? detail['internProfile'] : null;
  const detailRoles = detail && Array.isArray(detail['roleAssignments']) ? (detail['roleAssignments'] as unknown[]).filter(isRecord) : [];
  const detailSupervisors = detailProfile && Array.isArray(detailProfile['supervisorAssignments'])
    ? (detailProfile['supervisorAssignments'] as unknown[]).filter(isRecord)
    : [];

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

      <div className="card flex flex-wrap items-center gap-2 p-3" aria-label="Filter pengguna">
        <input
          type="search"
          aria-label="Cari pengguna"
          placeholder="Cari username / nama…"
          className="input min-h-touch w-full sm:min-w-[12rem] sm:flex-1"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <select
          aria-label="Filter role"
          className="input min-h-touch w-auto min-w-[9rem] flex-1 sm:flex-none"
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
        >
          <option value="">Semua role</option>
          {roleFilterOptions.map((r) => (
            <option key={r.id} value={r.code ?? ''}>{r.name ?? r.code}</option>
          ))}
        </select>
        <select
          aria-label="Filter direktorat"
          className="input min-h-touch w-auto min-w-[9rem] flex-1 sm:flex-none"
          value={bureauId}
          onChange={(e) => { setBureauId(e.target.value); setPage(1); }}
        >
          <option value="">Semua direktorat</option>
          {bureaus.map((b) => (
            <option key={asString(b['id'])} value={asString(b['id'])}>{asString(b['name'])}</option>
          ))}
        </select>
        <select
          aria-label="Filter biro"
          className="input min-h-touch w-auto min-w-[9rem] flex-1 sm:flex-none"
          value={divisionId}
          disabled={!bureauId}
          onChange={(e) => { setDivisionId(e.target.value); setPage(1); }}
        >
          <option value="">Semua biro</option>
          {divisions.map((d) => (
            <option key={asString(d['id'])} value={asString(d['id'])}>{asString(d['name'])}</option>
          ))}
        </select>
        <select
          aria-label="Filter status akun"
          className="input min-h-touch w-auto min-w-[9rem] flex-1 sm:flex-none"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">Semua status</option>
          {ACCOUNT_STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <div className="ml-auto flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => setImportOpen(true)}>
            <span className="flex items-center gap-1.5"><Icon name="download" className="h-4 w-4" /> Import Excel</span>
          </button>
          <button type="button" className="btn-primary" onClick={() => setCreateOpen(true)}>
            Tambah Pengguna
          </button>
        </div>
      </div>

      {usersQuery.isError ? (
        <ErrorState
          message={usersQuery.error instanceof Error ? usersQuery.error.message : 'Gagal memuat.'}
          onRetry={() => void usersQuery.refetch()}
        />
      ) : (
        <>
          <FetchIndicator show={usersQuery.isFetching && !usersQuery.isLoading} />
          <DataTable
            columns={columns}
            rows={(usersQuery.data?.items ?? []).filter(isRecord) as Row[]}
            rowKey={(row) => asString(row['id'])}
            loading={usersQuery.isLoading}
            emptyTitle="Belum ada pengguna"
            caption="Data pengguna"
          />
          {usersQuery.data ? (
            <ServerPagination
              pagination={usersQuery.data.pagination}
              onPageChange={setPage}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
            />
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={createOpen}
        title="Tambah Pengguna"
        confirmLabel="Simpan"
        wide
        busy={createMutation.isPending}
        onClose={() => setCreateOpen(false)}
        onConfirm={() => createMutation.mutate()}
      >
        <div ref={createBodyRef} className="mt-3 max-h-[60vh] space-y-3 overflow-y-auto pr-4 scroll-slim">
          {(
            [
              ['username', 'Username', 'text', true],
              ['displayName', 'Nama tampilan', 'text', true],
              ['password', 'Kata sandi awal (min. 10 karakter)', 'password', true],
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
          <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-stone-300"
              checked={createForm.profile.asIntern}
              onChange={(e) => {
                const { checked } = e.target;
                setCreateForm((f) => ({ ...f, profile: { ...f.profile, asIntern: checked } }));
                if (checked) {
                  requestAnimationFrame(() => scrollToInternFields(createBodyRef.current, createInternRef.current));
                }
              }}
            />
            Jadikan peserta magang
          </label>
          {createForm.profile.asIntern ? (
            <div ref={createInternRef}>{profileFields(createForm.profile, (profile) => setCreateForm((f) => ({ ...f, profile })))}</div>
          ) : null}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={editRow !== null}
        title="Ubah Pengguna"
        confirmLabel="Simpan"
        wide
        busy={editMutation.isPending}
        onClose={() => setEditRow(null)}
        onConfirm={() => editMutation.mutate()}
      >
        <div ref={editBodyRef} className="mt-3 max-h-[60vh] space-y-3 overflow-y-auto pr-4 scroll-slim">
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
              {ACCOUNT_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Reset kata sandi</p>
            <p className="mt-1 text-xs text-stone-500">
              Kata sandi lama tidak dapat dilihat siapa pun — sistem menyimpan hash, bukan teks asli. Isi di bawah hanya untuk mengganti.
            </p>
            <label className="label mt-2" htmlFor="user-edit-password">Kata sandi baru (opsional)</label>
            <div className="flex items-center gap-1">
              <input
                id="user-edit-password"
                type={showEditPassword ? 'text' : 'password'}
                autoComplete="new-password"
                className="input min-h-touch w-full min-w-0"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
              />
              <button
                type="button"
                className="btn-secondary shrink-0 px-2"
                aria-label={showEditPassword ? 'Sembunyikan kata sandi baru' : 'Lihat kata sandi baru'}
                onClick={() => setShowEditPassword((v) => !v)}
              >
                {showEditPassword ? 'Sembunyikan' : 'Lihat'}
              </button>
            </div>
            <p className="mt-1 text-xs text-stone-500">
              Minimal 10 karakter. Jika diisi, semua sesi aktif pengguna dicabut dan harus login ulang dengan sandi baru.
            </p>
          </div>
          {editHadProfile ? null : (
            <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-stone-300"
                checked={editForm.profile.asIntern}
                onChange={(e) => {
                  const { checked } = e.target;
                  setEditForm((f) => ({ ...f, profile: { ...f.profile, asIntern: checked } }));
                  if (checked) {
                    requestAnimationFrame(() => scrollToInternFields(editBodyRef.current, editInternRef.current));
                  }
                }}
              />
              Jadikan peserta magang
            </label>
          )}
          {editForm.profile.asIntern ? (
            <div ref={editInternRef}>{profileFields(editForm.profile, (profile) => setEditForm((f) => ({ ...f, profile })))}</div>
          ) : null}
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

      <ConfirmDialog
        open={detailId !== null}
        title={`Detail Pengguna${detail ? `: ${asString(detail['username'])}` : ''}`}
        confirmLabel="Tutup"
        hideCancel
        busy={detailQuery.isLoading}
        onClose={() => setDetailId(null)}
        onConfirm={() => setDetailId(null)}
      >
        <div className="mt-3 max-h-[65vh] space-y-4 overflow-y-auto pr-4 scroll-slim">
          {detailQuery.isError ? (
            <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">Gagal memuat detail.</p>
          ) : detail ? (
            <>
              <section>
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Akun</p>
                <dl className="mt-1 grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
                  <dt className="text-stone-500">Nama tampilan</dt><dd className="font-medium">{asString(detail['displayName'])}</dd>
                  <dt className="text-stone-500">Email</dt><dd>{asString(detail['email']) || '-'}</dd>
                  <dt className="text-stone-500">Telepon</dt><dd>{asString(detail['phone']) || '-'}</dd>
                  <dt className="text-stone-500">Status akun</dt><dd>{asString(detail['accountStatus'])}</dd>
                  <dt className="text-stone-500">Dibuat</dt><dd>{datePart(detail['createdAt'])}</dd>
                </dl>
              </section>
              <section>
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Role</p>
                <p className="mt-1 text-sm">
                  {detailRoles.length > 0
                    ? detailRoles
                        .map((ra) => (isRecord(ra['role']) ? asString(ra['role']['name']) : '-'))
                        .join(', ')
                    : '-'}
                </p>
              </section>
              <section>
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Peserta magang</p>
                {detailProfile ? (
                  <dl className="mt-1 grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
                    <dt className="text-stone-500">No. peserta</dt><dd className="font-medium">{asString(detailProfile['participantNumber'])}</dd>
                    <dt className="text-stone-500">Direktorat</dt><dd>{isRecord(detailProfile['bureau']) ? asString(detailProfile['bureau']['name']) : '-'}</dd>
                    <dt className="text-stone-500">Biro</dt><dd>{isRecord(detailProfile['division']) ? asString(detailProfile['division']['name']) : '-'}</dd>
                    <dt className="text-stone-500">Penempatan</dt><dd>{isRecord(detailProfile['placement']) ? asString(detailProfile['placement']['name']) : '-'}</dd>
                    <dt className="text-stone-500">Periode</dt><dd>{datePart(detailProfile['startDate'])} s/d {datePart(detailProfile['endDate']) || '-'}</dd>
                    <dt className="text-stone-500">Status</dt><dd>{asString(detailProfile['status'])}</dd>
                  </dl>
                ) : (
                  <p className="mt-1 text-sm text-stone-500">Belum terdaftar sebagai peserta magang. Gunakan menu Ubah untuk mendaftarkan.</p>
                )}
              </section>
              <section>
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Pembimbing aktif</p>
                {detailSupervisors.length > 0 ? (
                  <ul className="mt-1 space-y-1 text-sm">
                    {detailSupervisors.map((sa) => (
                      <li key={asString(sa['id'])}>
                        {isRecord(sa['supervisor']) ? asString(sa['supervisor']['displayName']) : '-'}
                        <span className="text-xs text-stone-400"> · sejak {datePart(sa['validFrom'])}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-sm text-stone-500">Belum ada pembimbing aktif.</p>
                )}
                {has('admin:assignments:manage') && detailProfile ? (
                  <div className="mt-2 rounded-lg border border-stone-200 bg-stone-50 p-3">
                    <MasterCombobox
                      id="assign-supervisor"
                      label="Tugaskan pembimbing"
                      value={supervisorId}
                      valueLabel={supervisorLabel}
                      allowClear
                      fetchOptions={fetchUserOptions('SUPERVISOR')}
                      onChange={(value, label) => { setSupervisorId(value); setSupervisorLabel(label); }}
                    />
                    {assignError ? (
                      <p className="mt-1 text-xs font-medium text-red-600" role="alert">{assignError}</p>
                    ) : null}
                    <button
                      type="button"
                      className="btn-secondary mt-2 w-full"
                      disabled={assignMutation.isPending || !supervisorId}
                      onClick={() => assignMutation.mutate()}
                    >
                      {assignMutation.isPending ? 'Memproses…' : 'Tugaskan'}
                    </button>
                  </div>
                ) : null}
              </section>
            </>
          ) : (
            <p className="text-sm text-stone-500">Memuat…</p>
          )}
        </div>
      </ConfirmDialog>

      <ImportUsersDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={(message) => setNotice(message)}
      />
    </div>
  );
}
