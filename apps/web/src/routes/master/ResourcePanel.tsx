import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import { asString, isRecord, type Paginated } from '../../lib/types';
import { DataTable, type Column } from '../../components/DataTable';
import { ErrorState } from '../../components/ErrorState';
import { ServerPagination } from '../../components/ServerPagination';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { SuccessNotice } from '../../components/SuccessNotice';
import { buildSchema, type ResourceConfig } from './config';

type Row = Record<string, unknown>;

interface ResourcePanelProps {
  config: ResourceConfig;
}

function toFormValues(row: Row | null, config: ResourceConfig): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of config.fields) {
    const raw = row ? row[field.name] : undefined;
    values[field.name] = raw === null || raw === undefined ? '' : String(raw);
  }
  return values;
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
    } else if (field.name === 'isActive' || raw === 'true' || raw === 'false') {
      payload[field.name] = raw === 'true' ? true : raw === 'false' ? false : raw;
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
  const [values, setValues] = useState<Record<string, string>>({});
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
      setErrors({});
      setFormError(null);
    }
  }, [dialogOpen, editing, config]);

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
      const payload = parsePayload(values, config, mode);
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
      setFormError(error instanceof ApiError ? error.message : 'Gagal menyimpan data.');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (row: Row) =>
      api<Row>(`${config.path}/${asString(row['id'])}`, {
        method: 'PATCH',
        body: { isActive: row['isActive'] === false },
      }),
    onSuccess: () => {
      setNotice(`Status ${config.label.toLowerCase()} diperbarui.`);
      invalidate();
    },
    onError: (error: unknown) => {
      setFormError(error instanceof ApiError ? error.message : 'Gagal mengubah status.');
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
          {config.hasActiveToggle ? (
            <button
              type="button"
              className="min-h-touch rounded-lg border border-amber-200 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
              disabled={toggleMutation.isPending}
              onClick={(e) => {
                e.stopPropagation();
                toggleMutation.mutate(row);
              }}
            >
              {row['isActive'] === false ? 'Aktifkan' : 'Nonaktifkan'}
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
        <div className="mt-3 max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {formError ? (
            <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{formError}</p>
          ) : null}
          {config.fields
            .filter((field) => !(editing && field.createOnly))
            .map((field) => {
              const fieldId = `master-${config.key}-${field.name}`;
              const error = errors[field.name];
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
                  {error ? (
                    <p className="mt-1 text-xs font-medium text-red-600" role="alert">{error}</p>
                  ) : null}
                </div>
              );
            })}
        </div>
      </ConfirmDialog>
    </div>
  );
}
