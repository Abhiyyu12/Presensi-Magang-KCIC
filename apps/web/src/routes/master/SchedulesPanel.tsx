import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, firstFieldErrorMessage } from '../../lib/api';
import { asString, isRecord, type Paginated } from '../../lib/types';
import { DataTable, type Column } from '../../components/DataTable';
import { ErrorState } from '../../components/ErrorState';
import { ServerPagination } from '../../components/ServerPagination';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { MasterCombobox } from '../../components/MasterCombobox';
import { SuccessNotice } from '../../components/SuccessNotice';
import { fetchScheduleScopeOptions } from './options';

type Row = Record<string, unknown>;

interface DayRow {
  weekday: number;
  isWorkingDay: boolean;
  startTime: string;
  endTime: string;
  lateToleranceMinutes: number | null;
}

interface FormDefaults {
  defaultWorkdays: number[] | null;
  lateToleranceDefaultMinutes: number | null;
}

const DAY_NAMES = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

const SCOPE_LABELS: Record<string, string> = {
  GLOBAL: 'Global',
  BUREAU: 'Direktorat',
  DIVISION: 'Biro',
  INDIVIDUAL: 'Peserta (individu)',
};

// Empty times/tolerance = "not filled"; the server applies the business-parameter
// default for tolerance. No policy values are invented in the client.
function defaultDays(defaults?: FormDefaults): DayRow[] {
  return DAY_NAMES.map((_, index) => ({
    weekday: index + 1,
    isWorkingDay: defaults?.defaultWorkdays?.includes(index + 1) ?? false,
    startTime: '',
    endTime: '',
    lateToleranceMinutes: null,
  }));
}

function parseDays(raw: unknown): DayRow[] {
  const days = defaultDays();
  if (!Array.isArray(raw)) return days;
  for (const item of raw.filter(isRecord)) {
    const weekday = Number(item['weekday']);
    const target = days.find((d) => d.weekday === weekday);
    if (!target) continue;
    target.isWorkingDay = item['isWorkingDay'] === true;
    target.startTime = asString(item['startTime'], '').slice(0, 5);
    target.endTime = asString(item['endTime'], '').slice(0, 5);
    target.lateToleranceMinutes =
      typeof item['lateToleranceMinutes'] === 'number' ? item['lateToleranceMinutes'] : null;
  }
  return days;
}

export function SchedulesPanel() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteRow, setDeleteRow] = useState<Row | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    scopeType: 'GLOBAL',
    scopeId: '',
    validFrom: '',
    validTo: '',
  });
  const [days, setDays] = useState<DayRow[]>(() => defaultDays());

  const defaultsQuery = useQuery({
    queryKey: ['master', 'schedules', 'form-defaults'],
    queryFn: () => api<FormDefaults>('/admin/schedules/form-defaults'),
  });

  const listQuery = useQuery({
    queryKey: ['master', 'schedules', page],
    queryFn: () => api<Paginated<Row>>('/admin/schedules', { query: { page, pageSize: 15 } }),
    placeholderData: (previous) => previous,
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['master', 'schedules'] });

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: '', scopeType: 'GLOBAL', scopeId: '', validFrom: '', validTo: '' });
    setDays(defaultDays(defaultsQuery.data));
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = async (row: Row) => {
    setEditingId(asString(row['id'], ''));
    setFormError(null);
    try {
      const detail = await api<Row>(`/admin/schedules/${asString(row['id'])}`);
      setForm({
        name: asString(detail['name'] ?? row['name'], ''),
        scopeType: asString(detail['scopeType'] ?? row['scopeType'], 'GLOBAL'),
        scopeId: asString(detail['scopeId'] ?? row['scopeId'], ''),
        validFrom: asString(detail['validFrom'] ?? row['validFrom'], '').slice(0, 10),
        validTo: asString(detail['validTo'] ?? row['validTo'], '').slice(0, 10),
      });
      setDays(parseDays(detail['days'] ?? row['days']));
      setDialogOpen(true);
    } catch (error) {
      setFormError((error instanceof ApiError && (firstFieldErrorMessage(error.fieldErrors) ?? error.message)) || 'Gagal memuat detail jadwal.');
    }
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!form.name || !form.validFrom) {
        throw new ApiError('VALIDATION', 'Nama dan tanggal berlaku wajib diisi.', 400);
      }
      for (const day of days) {
        if (day.isWorkingDay && (!day.startTime || !day.endTime)) {
          throw new ApiError('VALIDATION', 'Jam masuk dan jam pulang wajib diisi untuk hari kerja.', 400);
        }
      }
      const payload = {
        name: form.name,
        scopeType: form.scopeType,
        ...(form.scopeId ? { scopeId: form.scopeId } : {}),
        validFrom: form.validFrom,
        ...(form.validTo ? { validTo: form.validTo } : {}),
        days: days.map((d) => ({
          weekday: d.weekday,
          isWorkingDay: d.isWorkingDay,
          ...(d.isWorkingDay ? { startTime: d.startTime, endTime: d.endTime } : {}),
          ...(d.lateToleranceMinutes != null ? { lateToleranceMinutes: d.lateToleranceMinutes } : {}),
        })),
      };
      return editingId
        ? api<Row>(`/admin/schedules/${editingId}`, { method: 'PATCH', body: payload })
        : api<Row>('/admin/schedules', { method: 'POST', body: payload });
    },
    onSuccess: () => {
      setDialogOpen(false);
      setFormError(null);
      invalidate();
    },
    onError: (error: unknown) => {
      setFormError((error instanceof ApiError && (firstFieldErrorMessage(error.fieldErrors) ?? error.message)) || 'Gagal menyimpan jadwal.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (row: Row) => api<Row>(`/admin/schedules/${asString(row['id'])}`, { method: 'DELETE' }),
    onSuccess: () => {
      setNotice('Jadwal dihapus.');
      setDeleteRow(null);
      setFormError(null);
      invalidate();
    },
    onError: (error: unknown) => {
      // Jadwal dipakai snapshot → tampilkan alasan penolakan server, dialog tetap terbuka.
      setFormError((error instanceof ApiError && (firstFieldErrorMessage(error.fieldErrors) ?? error.message)) || 'Gagal menghapus jadwal.');
    },
  });

  const columns: Column<Row>[] = [
    { header: 'Nama', cell: (row) => asString(row['name']) },
    { header: 'Cakupan', cell: (row) => SCOPE_LABELS[asString(row['scopeType'])] ?? asString(row['scopeType']) },
    { header: 'Berlaku dari', cell: (row) => asString(row['validFrom']).slice(0, 10) },
    { header: 'Berlaku sampai', cell: (row) => (row['validTo'] ? asString(row['validTo']).slice(0, 10) : '-') },
    {
      header: 'Aksi',
      cell: (row) => (
        <span className="flex gap-2">
          <button
            type="button"
            className="text-xs font-semibold text-brand-700 hover:underline"
            onClick={() => void openEdit(row)}
          >
            Ubah
          </button>
          <button
            type="button"
            className="min-h-touch rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            disabled={deleteMutation.isPending}
            onClick={(e) => {
              e.stopPropagation();
              setFormError(null);
              setDeleteRow(row);
            }}
          >
            Hapus
          </button>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      {notice ? <SuccessNotice message={notice} onDismiss={() => setNotice(null)} /> : null}
      {formError && !dialogOpen && deleteRow === null ? (
        <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{formError}</p>
      ) : null}
      <div className="flex justify-end">
        <button type="button" className="btn-primary" onClick={openCreate}>
          Tambah Jadwal
        </button>
      </div>

      {listQuery.isError ? (
        <ErrorState
          message={listQuery.error instanceof Error ? listQuery.error.message : 'Gagal memuat.'}
          onRetry={() => void listQuery.refetch()}
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={(listQuery.data?.items ?? []).filter(isRecord) as Row[]}
            rowKey={(row) => asString(row['id'])}
            loading={listQuery.isLoading}
            emptyTitle="Belum ada jadwal"
            caption="Data jadwal kerja"
          />
          {listQuery.data ? (
            <ServerPagination pagination={listQuery.data.pagination} onPageChange={setPage} />
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={dialogOpen}
        title={editingId ? 'Ubah Jadwal' : 'Tambah Jadwal'}
        confirmLabel="Simpan"
        busy={saveMutation.isPending}
        onClose={() => setDialogOpen(false)}
        onConfirm={() => saveMutation.mutate()}
      >
        <div className="mt-3 max-h-[60vh] space-y-3 overflow-y-auto pr-4 scroll-slim">
          {formError ? (
            <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{formError}</p>
          ) : null}
          <div>
            <label className="label" htmlFor="sched-name">Nama jadwal *</label>
            <input
              id="sched-name"
              className="input"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="sched-scope">Cakupan</label>
              <select
                id="sched-scope"
                className="input"
                value={form.scopeType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, scopeType: e.target.value, scopeId: '' }))
                }
              >
                <option value="GLOBAL">Global — semua peserta</option>
                <option value="BUREAU">Direktorat — satu direktorat</option>
                <option value="DIVISION">Biro — satu biro</option>
                <option value="INDIVIDUAL">Peserta (individu) — satu peserta</option>
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Saat peserta absen, dipakai jadwal paling spesifik yang berlaku: individu lebih utama dari biro, biro dari direktorat, direktorat dari global.
              </p>
            </div>
            {form.scopeType === 'GLOBAL' ? null : (
              <MasterCombobox
                id="sched-scope-id"
                label={`Objek scope (${SCOPE_LABELS[form.scopeType] ?? form.scopeType})`}
                value={form.scopeId}
                onChange={(value) => setForm((f) => ({ ...f, scopeId: value }))}
                fetchOptions={(search) => fetchScheduleScopeOptions(search, form.scopeType)}
                serverSearch
                queryExtra={form.scopeType}
                required={form.scopeType !== 'GLOBAL'}
              />
            )}
            <div>
              <label className="label" htmlFor="sched-from">Berlaku dari *</label>
              <input
                id="sched-from"
                type="date"
                className="input"
                value={form.validFrom}
                onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
              />
            </div>
            <div>
              <label className="label" htmlFor="sched-to">Berlaku sampai</label>
              <input
                id="sched-to"
                type="date"
                className="input"
                value={form.validTo}
                onChange={(e) => setForm((f) => ({ ...f, validTo: e.target.value }))}
              />
            </div>
          </div>
          <fieldset>
            <legend className="label">Pola hari</legend>
            <div className="space-y-2">
              {days.map((day, index) => (
                <div key={day.weekday} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 text-xs">
                  <label className="flex items-center gap-1.5 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={day.isWorkingDay}
                      aria-label={`${DAY_NAMES[index] ?? day.weekday} adalah hari kerja`}
                      onChange={(e) =>
                        setDays((d) =>
                          d.map((item) =>
                            item.weekday === day.weekday
                              ? { ...item, isWorkingDay: e.target.checked }
                              : item,
                          ),
                        )
                      }
                    />
                    {DAY_NAMES[index] ?? day.weekday}
                  </label>
                  <input
                    type="time"
                    className="input px-2 py-1"
                    value={day.startTime}
                    disabled={!day.isWorkingDay}
                    aria-label={`Jam masuk ${DAY_NAMES[index] ?? day.weekday}`}
                    onChange={(e) =>
                      setDays((d) =>
                        d.map((item) =>
                          item.weekday === day.weekday ? { ...item, startTime: e.target.value } : item,
                        ),
                      )
                    }
                  />
                  <input
                    type="time"
                    className="input px-2 py-1"
                    value={day.endTime}
                    disabled={!day.isWorkingDay}
                    aria-label={`Jam pulang ${DAY_NAMES[index] ?? day.weekday}`}
                    onChange={(e) =>
                      setDays((d) =>
                        d.map((item) =>
                          item.weekday === day.weekday ? { ...item, endTime: e.target.value } : item,
                        ),
                      )
                    }
                  />
                  <input
                    type="number"
                    min={0}
                    className="input w-16 px-2 py-1"
                    value={day.lateToleranceMinutes ?? ''}
                    disabled={!day.isWorkingDay}
                    aria-label={`Toleransi terlambat (menit) ${DAY_NAMES[index] ?? day.weekday}`}
                    onChange={(e) =>
                      setDays((d) =>
                        d.map((item) =>
                          item.weekday === day.weekday
                            ? {
                                ...item,
                                lateToleranceMinutes: e.target.value === '' ? null : Number(e.target.value),
                              }
                            : item,
                        ),
                      )
                    }
                  />
                </div>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Kolom terakhir adalah toleransi keterlambatan dalam menit. Kosongkan untuk memakai
              default dari Parameter bisnis (tab Parameter). Perhitungan terlambat tetap dilakukan server.
            </p>
          </fieldset>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={deleteRow !== null}
        title="Hapus Jadwal"
        description={`Jadwal "${deleteRow ? asString(deleteRow['name']) : ''}" akan dihapus permanen beserta pola harinya. Jika masih direferensikan snapshot hari kerja, server menolak penghapusan dan menyarankan penonaktifan.`}
        confirmLabel="Ya, Hapus"
        danger
        busy={deleteMutation.isPending}
        onClose={() => setDeleteRow(null)}
        onConfirm={() => deleteMutation.mutate(deleteRow as Row)}
      >
        {formError && deleteRow ? (
          <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{formError}</p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
