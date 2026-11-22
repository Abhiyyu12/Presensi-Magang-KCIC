import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, firstFieldErrorMessage } from '../../lib/api';
import { asString, isRecord, type Paginated } from '../../lib/types';
import { DataTable, type Column } from '../../components/DataTable';
import { ErrorState } from '../../components/ErrorState';
import { ServerPagination } from '../../components/ServerPagination';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { MasterCombobox } from '../../components/MasterCombobox';
import { SuccessNotice } from '../../components/SuccessNotice';
import { buildSchema, type FieldConfig, type ResourceConfig } from './config';

type Row = Record<string, unknown>;

interface ResourcePanelProps {
  config: ResourceConfig;
}

function toFormValues(row: Row | null, config: ResourceConfig): Record<string, string> {
  const source = row && config.toForm ? config.toForm(row) : row;
  const values: Record<string, string> = {};
  for (const field of config.fields) {
    const raw = source ? source[field.name] : undefined;
    values[field.name] = raw === null || raw === undefined ? '' : String(raw);
  }
  return values;
}

function toInitialLabels(row: Row | null, config: ResourceConfig): Record<string, string> {
  const labels: Record<string, string> = {};
  if (!row) return labels;
  for (const field of config.fields) {
    if (field.combobox?.labelFromRow) labels[field.name] = field.combobox.labelFromRow(row);
  }
  return labels;
}

function parsePayload(
  values: Record<string, string>,
  config: ResourceConfig,
  mode: 'create' | 'edit',
): Row {
  const payload: Row = {};
  for (const field of config.fields) {
    if (mode === 'edit' && field.createOnly) continue;
    const raw = values[field.name] ?? '';
    if (raw === '' && !field.required) continue;
    if (field.type === 'number') {
      payload[field.name] = Number(raw);
    } else {
      payload[field.name] = raw;
    }
  }
  return payload;
}

export function ResourcePanel({ config }: ResourcePanelProps) {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [deleteRow, setDeleteRow] = useState<Row | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: ['master', config.key, page],
    queryFn: () => api<Paginated<Row>>(config.path, { query: { page, pageSize: 15 } }),
    placeholderData: (previous) => previous,
  });

  useEffect(() => {
    if (dialogOpen) {
      setValues(toFormValues(editing, config));
      setLabels(toInitialLabels(editing, config));
      setErrors({});
      setFormError(null);
    }
  }, [dialogOpen, editing, config]);

  // Mengganti nilai field dependensi (mis. Direktorat) mengosongkan field turunannya (Biro).
  const handleComboboxChange = (field: FieldConfig, value: string, label: string, meta?: Record<string, unknown>) => {
    setValues((v) => ({ ...v, [field.name]: value }));
    setLabels((l) => ({ ...l, [field.name]: label }));
    const autofill = field.combobox?.autofillDates;
    if (autofill) {
      const start = typeof meta?.['profileStart'] === 'string' ? meta['profileStart'] : '';
      const end = typeof meta?.['profileEnd'] === 'string' ? meta['profileEnd'] : '';
      setValues((v) => ({
        ...v,
        [autofill.startField]: start.slice(0, 10),
        ...(end ? { [autofill.endField]: end.slice(0, 10) } : {}),
      }));
    }
    for (const dependent of config.fields) {
      if (dependent.combobox?.dependsOn !== field.name) continue;
      setValues((v) => (v[dependent.name] ? { ...v, [dependent.name]: '' } : v));
      setLabels((l) => ({ ...l, [dependent.name]: '' }));
    }
  };

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['master', config.key] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const mode = editing ? 'edit' : 'create';
      const schema = buildSchema(config.fields, mode);
      const parsed = schema.safeParse(values);
      if (!parsed.success) {
        const nextErrors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const key = String(issue.path[0] ?? '');
          if (key && !nextErrors[key]) nextErrors[key] = issue.message;
        }
        setErrors(nextErrors);
        // Throw so the dialog stays open and field errors remain visible.
        throw new ApiError('VALIDATION', 'Periksa kembali isian yang ditandai merah.', 400);
      }
      setErrors({});
      const parsedPayload = parsePayload(values, config, mode);
      const payload = config.toPayload ? config.toPayload(parsedPayload, mode) : parsedPayload;
      if (editing) {
        await api<Row>(`${config.path}/${asString(editing['id'])}`, { method: 'PATCH', body: payload });
      } else {
        await api<Row>(config.path, { method: 'POST', body: payload });
      }
    },
    onSuccess: () => {
      setNotice(
        editing
          ? `Perubahan ${config.label.toLowerCase()} disimpan.`
          : `${config.label} baru berhasil ditambahkan.`,
      );
      setDialogOpen(false);
      setEditing(null);
      setFormError(null);
      invalidate();
    },
    onError: (error: unknown) => {
      setFormError((error instanceof ApiError && (firstFieldErrorMessage(error.fieldErrors) ?? error.message)) || 'Gagal menyimpan data.');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (row: Row) =>
      api<Row>(`${config.path}/${asString(row['id'])}`, {
        method: 'PATCH',
        body: { status: row['status'] === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE' },
      }),
    onSuccess: () => {
      setNotice(`Status ${config.label.toLowerCase()} diperbarui.`);
      invalidate();
    },
    onError: (error: unknown) => {
      setFormError((error instanceof ApiError && (firstFieldErrorMessage(error.fieldErrors) ?? error.message)) || 'Gagal mengubah status.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (row: Row) =>
      api<{ deleted: boolean; id: string }>(`${config.path}/${asString(row['id'])}`, { method: 'DELETE' }),
    onSuccess: () => {
      setNotice(`${config.label} dihapus.`);
      setDeleteRow(null);
      setFormError(null);
      invalidate();
    },
    onError: (error: unknown) => {
      // Data dipakai entitas lain → server menolak dengan alasan; dialog tetap terbuka.
      setFormError((error instanceof ApiError && (firstFieldErrorMessage(error.fieldErrors) ?? error.message)) || 'Gagal menghapus data.');
    },
  });

  const columns: Column<Row>[] = [
    ...config.columns.map((col) => ({
      header: col.header,
      cell: (row: Row) =>
        col.render ? col.render(row) : asString(col.field ? row[col.field] : undefined),
    })),
    {
      header: 'Aksi',
      cell: (row: Row) => (
        <span className="flex gap-2">
          <button
            type="button"
            className="min-h-touch rounded-lg border border-slate-200 px-3 text-xs font-semibold text-brand-700 hover:bg-brand-50"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(row);
              setDialogOpen(true);
            }}
          >
            Ubah
          </button>
          {config.hasStatusToggle ? (
            <button
              type="button"
              className="min-h-touch rounded-lg border border-amber-200 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
              disabled={toggleMutation.isPending}
              onClick={(e) => {
                e.stopPropagation();
                toggleMutation.mutate(row);
              }}
            >
              {row['status'] === 'INACTIVE' ? 'Aktifkan' : 'Nonaktifkan'}
            </button>
          ) : null}
          {config.hasDelete ? (
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
          ) : null}
        </span>
      ),
    },
  ];

  const items = (listQuery.data?.items ?? []).filter(isRecord) as Row[];

  return (
    <div className="space-y-3">
      {notice ? <SuccessNotice message={notice} onDismiss={() => setNotice(null)} /> : null}
      {formError && !dialogOpen ? (
        <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{formError}</p>
      ) : null}
      <div className="flex justify-end">
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          Tambah {config.label}
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
            rows={items}
            rowKey={(row) => asString(row['id'])}
            loading={listQuery.isLoading}
            emptyTitle={`Belum ada data ${config.label.toLowerCase()}`}
            emptyDescription="Gunakan tombol tambah untuk membuat entri baru."
            caption={`Data master ${config.label}`}
          />
          {listQuery.data ? (
            <ServerPagination pagination={listQuery.data.pagination} onPageChange={setPage} />
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={dialogOpen}
        title={editing ? `Ubah ${config.label}` : `Tambah ${config.label}`}
        confirmLabel="Simpan"
        busy={saveMutation.isPending}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
        }}
        onConfirm={() => saveMutation.mutate()}
      >
        <div className="mt-3 max-h-[60vh] space-y-3 overflow-y-auto pr-4 scroll-slim">
          {formError ? (
            <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{formError}</p>
          ) : null}
          {config.fields
            .filter((field) => !(editing && field.createOnly))
            .filter(
              (field) =>
                !(
                  field.combobox?.hideWhen &&
                  field.combobox.hideWhen.equals.includes(values[field.combobox.hideWhen.field] ?? '')
                ),
            )
            .map((field) => {
              const fieldId = `master-${config.key}-${field.name}`;
              const error = errors[field.name];
              if (field.type === 'combobox' && field.combobox) {
                const combo = field.combobox;
                const depValue = combo.dependsOn ? (values[combo.dependsOn] ?? '') : '';
                const depField = combo.dependsOn
                  ? config.fields.find((f) => f.name === combo.dependsOn)
                  : undefined;
                return (
                  <div key={field.name}>
                    <MasterCombobox
                      id={fieldId}
                      label={field.label}
                      value={values[field.name] ?? ''}
                      valueLabel={labels[field.name] || undefined}
                      onChange={(value, label, meta) => handleComboboxChange(field, value, label, meta)}
                      fetchOptions={(search) => combo.fetchOptions(search, depValue)}
                      serverSearch={combo.serverSearch ?? true}
                      queryExtra={combo.dependsOn ? (depValue === '' ? null : depValue) : undefined}
                      depHint={depField ? `Pilih ${depField.label} terlebih dahulu.` : undefined}
                      required={field.required}
                      error={error}
                      allowClear={!field.required}
                    />
                    {field.hint && !error ? (
                      <p className="mt-1 text-xs text-slate-500">{field.hint}</p>
                    ) : null}
                  </div>
                );
              }
              return (
                <div key={field.name}>
                  <label className="label" htmlFor={fieldId}>
                    {field.label}
                    {field.required ? <span className="ml-0.5 text-red-600">*</span> : null}
                  </label>
                  {field.type === 'select' ? (
                    <select
                      id={fieldId}
                      className="input"
                      value={values[field.name] ?? ''}
                      aria-invalid={Boolean(error)}
                      onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                    >
                      <option value="">—</option>
                      {(field.options ?? []).map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === 'textarea' ? (
                    <textarea
                      id={fieldId}
                      className="input"
                      rows={2}
                      value={values[field.name] ?? ''}
                      aria-invalid={Boolean(error)}
                      onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                    />
                  ) : (
                    <input
                      id={fieldId}
                      type={field.type}
                      className="input"
                      value={values[field.name] ?? ''}
                      aria-invalid={Boolean(error)}
                      onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
                    />
                  )}
                  {field.hint && !error ? (
                    <p className="mt-1 text-xs text-slate-500">{field.hint}</p>
                  ) : null}
                  {error ? (
                    <p className="mt-1 text-xs font-medium text-red-600" role="alert">{error}</p>
                  ) : null}
                </div>
              );
            })}
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={deleteRow !== null}
        title={`Hapus ${config.label}`}
        description={`${
          deleteRow
            ? asString(
                deleteRow['name'] ??
                  deleteRow['code'] ??
                  (isRecord(deleteRow['user']) ? deleteRow['user']['name'] : '') ??
                  '',
              ) || 'Data ini'
            : 'Data ini'
        } akan dihapus permanen. Jika masih dipakai data lain, server menolak penghapusan dan menyarankan penonaktifan.`}
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
