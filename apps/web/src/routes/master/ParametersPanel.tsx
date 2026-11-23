import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { asString, isRecord, type Paginated } from '../../lib/types';
import { DataTable, type Column } from '../../components/DataTable';
import { ErrorState } from '../../components/ErrorState';
import { ServerPagination } from '../../components/ServerPagination';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { SuccessNotice } from '../../components/SuccessNotice';
import { FetchIndicator } from '../../components/FetchIndicator';

type Row = Record<string, unknown>;

const DAY_LABELS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const PENDING_LABEL = 'Menunggu konfirmasi KCIC';

/** Array 0–6 dianggap daftar hari kerja (indeks = getDay). */
export function isWorkdayArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 7 &&
    value.every((v) => Number.isInteger(v) && v >= 0 && v <= 6)
  );
}

/** Nilai parameter ditampilkan manusiawi: angka polos, workdays jadi nama hari. */
export function formatParameterValue(valueJson: unknown): string {
  if (!isRecord(valueJson)) return '-';
  const value = valueJson['value'];
  if (typeof value === 'number') return String(value);
  if (isWorkdayArray(value)) return value.map((d) => DAY_LABELS[d] ?? String(d)).join(', ');
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

/**
 * Simpan hanya bagian `value`; key lain di valueJson (mis. status kebijakan)
 * dipertahankan apa adanya.
 */
export function buildNextValueJson(original: unknown, nextValue: unknown): Record<string, unknown> {
  return { ...(isRecord(original) ? original : {}), value: nextValue };
}

function policyStatusLabel(row: Row): string {
  const valueJson = row['valueJson'];
  const status = isRecord(valueJson) && typeof valueJson['status'] === 'string' ? valueJson['status'] : '';
  if (status === 'PENDING_KCIC_CONFIRMATION') return PENDING_LABEL;
  return status === '' ? '-' : status;
}

type EditorKind = 'number' | 'workdays' | 'text' | 'json';

function editorKindOf(value: unknown): EditorKind {
  if (typeof value === 'number') return 'number';
  if (isWorkdayArray(value)) return 'workdays';
  if (typeof value === 'string') return 'text';
  return 'json';
}

interface ParametersPanelProps {
  path: string;
  label: string;
}

export function ParametersPanel({ path, label }: ParametersPanelProps) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Row | null>(null);
  const [description, setDescription] = useState('');
  const [value, setValue] = useState<unknown>(null);
  const [valueJsonText, setValueJsonText] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['master', 'business-parameters', page],
    queryFn: () => api<Paginated<Row>>(path, { query: { page, pageSize: 15 } }),
    placeholderData: (previous) => previous,
  });

  useEffect(() => {
    if (!editing) return;
    const valueJson = editing['valueJson'];
    const raw = isRecord(valueJson) ? valueJson['value'] : null;
    setValue(raw);
    setValueJsonText(JSON.stringify(valueJson ?? null, null, 2));
    setDescription(typeof editing['description'] === 'string' ? editing['description'] : '');
    setFormError(null);
  }, [editing]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      let nextValueJson: unknown;
      switch (editorKindOf(isRecord(editing['valueJson']) ? editing['valueJson']['value'] : null)) {
        case 'number':
          nextValueJson = buildNextValueJson(editing['valueJson'], Number(value));
          break;
        case 'workdays':
          nextValueJson = buildNextValueJson(editing['valueJson'], value);
          break;
        case 'text':
          nextValueJson = buildNextValueJson(editing['valueJson'], value);
          break;
        default:
          try {
            nextValueJson = JSON.parse(valueJsonText);
          } catch {
            throw new Error('Nilai harus JSON yang valid. Minta bantuan IT bila tidak yakin.');
          }
      }
      await api<Row>(`${path}/${asString(editing['id'])}`, {
        method: 'PATCH',
        body: { valueJson: nextValueJson, description },
      });
    },
    onSuccess: () => {
      setNotice(`Perubahan ${label.toLowerCase()} disimpan.`);
      setEditing(null);
      setFormError(null);
      void queryClient.invalidateQueries({ queryKey: ['master', 'business-parameters'] });
    },
    onError: (error: unknown) => {
      setFormError((error instanceof Error && error.message) || 'Gagal menyimpan parameter.');
    },
  });

  const columns: Column<Row>[] = [
    { header: 'Kunci', cell: (row) => asString(row['key']) },
    { header: 'Nilai', cell: (row) => formatParameterValue(row['valueJson']) },
    { header: 'Status kebijakan', cell: (row) => policyStatusLabel(row) },
    { header: 'Keterangan', cell: (row) => asString(row['description']) || '-' },
    {
      header: 'Aksi',
      cell: (row) => (
        <button
          type="button"
          className="min-h-touch rounded-lg border border-stone-200 px-3 text-xs font-semibold text-brand-700 hover:bg-brand-50"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(row);
          }}
        >
          Ubah
        </button>
      ),
    },
  ];

  const items = (listQuery.data?.items ?? []).filter(isRecord) as Row[];
  const editingKind = editing
    ? editorKindOf(isRecord(editing['valueJson']) ? editing['valueJson']['value'] : null)
    : 'json';
  const editedWorkdays = isWorkdayArray(value) ? value : [];

  return (
    <div className="space-y-3">
      {notice ? <SuccessNotice message={notice} onDismiss={() => setNotice(null)} /> : null}
      <p className="text-sm text-stone-600">
        Parameter hanya dapat diubah nilainya; key baru ditambahkan lewat migrasi/seed oleh tim IT.
      </p>

      {listQuery.isError ? (
        <ErrorState
          message={listQuery.error instanceof Error ? listQuery.error.message : 'Gagal memuat.'}
          onRetry={() => void listQuery.refetch()}
        />
      ) : (
        <>
          <FetchIndicator show={listQuery.isFetching && !listQuery.isLoading} />
          <DataTable
            columns={columns}
            rows={items}
            rowKey={(row) => asString(row['id'])}
            loading={listQuery.isLoading}
            emptyTitle="Belum ada parameter"
            emptyDescription="Parameter operasional diisi oleh seed/migrasi."
            caption={`Data master ${label}`}
          />
          {listQuery.data ? (
            <ServerPagination pagination={listQuery.data.pagination} onPageChange={setPage} />
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={editing !== null}
        title={`Ubah ${label}`}
        confirmLabel="Simpan"
        busy={saveMutation.isPending}
        onClose={() => setEditing(null)}
        onConfirm={() => saveMutation.mutate()}
      >
        <div className="mt-3 space-y-3">
          {formError ? (
            <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{formError}</p>
          ) : null}
          {editing ? (
            <>
              <div>
                <span className="label">Kunci</span>
                <p className="rounded-lg bg-stone-50 px-3 py-2 font-mono text-sm text-stone-700">{asString(editing['key'])}</p>
              </div>
              {editingKind === 'number' ? (
                <div>
                  <label className="label" htmlFor="param-value">Nilai (angka)</label>
                  <input
                    id="param-value"
                    type="number"
                    className="input"
                    value={typeof value === 'number' ? String(value) : ''}
                    onChange={(e) => setValue(e.target.value === '' ? null : Number(e.target.value))}
                  />
                </div>
              ) : null}
              {editingKind === 'workdays' ? (
                <fieldset>
                  <legend className="label">Hari kerja</legend>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {DAY_LABELS.map((day, idx) => (
                      <label
                        key={day}
                        className={`flex min-h-touch cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-sm font-medium ${
                          editedWorkdays.includes(idx)
                            ? 'border-brand-600 bg-brand-50 text-brand-800'
                            : 'border-stone-200 bg-white text-stone-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={editedWorkdays.includes(idx)}
                          onChange={(e) =>
                            setValue(
                              e.target.checked
                                ? [...editedWorkdays, idx].sort((a, b) => a - b)
                                : editedWorkdays.filter((d) => d !== idx),
                            )
                          }
                        />
                        {day}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
              {editingKind === 'text' ? (
                <div>
                  <label className="label" htmlFor="param-value">Nilai (teks)</label>
                  <input
                    id="param-value"
                    type="text"
                    className="input"
                    value={typeof value === 'string' ? value : ''}
                    onChange={(e) => setValue(e.target.value)}
                  />
                </div>
              ) : null}
              {editingKind === 'json' ? (
                <div>
                  <label className="label" htmlFor="param-json">Nilai (JSON)</label>
                  <textarea
                    id="param-json"
                    className="input font-mono text-xs"
                    rows={5}
                    value={valueJsonText}
                    onChange={(e) => setValueJsonText(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-stone-500">
                    Format khusus — ubah hanya jika Anda memahami isinya; bila ragu, minta bantuan IT.
                  </p>
                </div>
              ) : null}
              <div>
                <label className="label" htmlFor="param-description">Keterangan</label>
                <textarea
                  id="param-description"
                  className="input"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </>
          ) : null}
        </div>
      </ConfirmDialog>
    </div>
  );
}
