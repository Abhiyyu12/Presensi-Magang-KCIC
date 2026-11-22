import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, firstFieldErrorMessage } from '../lib/api';
import { asString, isRecord, type HelpArticle, type HelpCategory, type Paginated } from '../lib/types';
import { DataTable, type Column } from '../components/DataTable';
import { ErrorState } from '../components/ErrorState';
import { ServerPagination } from '../components/ServerPagination';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface ArticleForm {
  title: string;
  content: string;
  categoryId: string;
}

const EMPTY_FORM: ArticleForm = { title: '', content: '', categoryId: '' };

export default function HelpAdminPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HelpArticle | null>(null);
  const [form, setForm] = useState<ArticleForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const articlesQuery = useQuery({
    queryKey: ['help', 'admin', 'articles', page],
    queryFn: () =>
      api<Paginated<HelpArticle>>('/help/articles', {
        query: { page, pageSize: 15, includeDrafts: true },
      }),
    placeholderData: (previous) => previous,
  });

  const categoriesQuery = useQuery({
    queryKey: ['help', 'categories'],
    queryFn: () => api<HelpCategory[] | Paginated<HelpCategory>>('/help/categories'),
  });

  const categories = Array.isArray(categoriesQuery.data)
    ? categoriesQuery.data
    : (categoriesQuery.data?.items ?? []);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['help'] });

  const saveMutation = useMutation({
    mutationFn: () => {
      if (form.title.trim().length < 3 || form.content.trim().length < 10) {
        throw new ApiError(
          'VALIDATION',
          'Judul minimal 3 karakter dan isi artikel minimal 10 karakter.',
          400,
        );
      }
      const body = {
        title: form.title,
        content: form.content,
        ...(form.categoryId ? { categoryId: form.categoryId } : {}),
      };
      return editing
        ? api<HelpArticle>(`/admin/help/articles/${editing.id}`, { method: 'PATCH', body })
        : api<HelpArticle>('/admin/help/articles', { method: 'POST', body });
    },
    onSuccess: () => {
      setDialogOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      setFormError(null);
      invalidate();
    },
    onError: (error: unknown) => {
      setFormError((error instanceof ApiError && (firstFieldErrorMessage(error.fieldErrors) ?? error.message)) || 'Gagal menyimpan artikel.');
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ article, action }: { article: HelpArticle; action: 'publish' | 'archive' }) =>
      api<HelpArticle>(`/admin/help/articles/${article.id}/${action}`, { method: 'POST' }),
    onSuccess: invalidate,
    onError: (error: unknown) => {
      setFormError((error instanceof ApiError && (firstFieldErrorMessage(error.fieldErrors) ?? error.message)) || 'Gagal mengubah status artikel.');
    },
  });

  const columns: Column<HelpArticle>[] = [
    { header: 'Judul', cell: (row) => row.title },
    { header: 'Kategori', cell: (row) => row.categoryName ?? '-' },
    { header: 'Status', cell: (row) => row.status ?? '-' },
    {
      header: 'Aksi',
      cell: (row) => (
        <span className="flex flex-wrap gap-2">
          <button
            type="button"
            className="text-xs font-semibold text-brand-700 hover:underline"
            onClick={() => {
              setEditing(row);
              setForm({
                title: row.title,
                content: row.content,
                categoryId: row.categoryId ?? '',
              });
              setFormError(null);
              setDialogOpen(true);
            }}
          >
            Ubah
          </button>
          {asString(row.status).toUpperCase() !== 'PUBLISHED' ? (
            <button
              type="button"
              className="text-xs font-semibold text-green-700 hover:underline"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate({ article: row, action: 'publish' })}
            >
              Publikasikan
            </button>
          ) : (
            <button
              type="button"
              className="text-xs font-semibold text-amber-700 hover:underline"
              disabled={statusMutation.isPending}
              onClick={() => statusMutation.mutate({ article: row, action: 'archive' })}
            >
              Arsipkan
            </button>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold text-slate-900">Kelola Artikel Bantuan</h1>
          <p className="text-sm text-slate-600">
            Artikel draft tidak terlihat pengguna sampai dipublikasikan.
          </p>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setEditing(null);
            setForm(EMPTY_FORM);
            setFormError(null);
            setDialogOpen(true);
          }}
        >
          Tambah Artikel
        </button>
      </header>

      {formError && !dialogOpen ? (
        <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{formError}</p>
      ) : null}

      {articlesQuery.isError ? (
        <ErrorState
          message={articlesQuery.error instanceof Error ? articlesQuery.error.message : 'Gagal memuat.'}
          onRetry={() => void articlesQuery.refetch()}
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={(articlesQuery.data?.items ?? []).filter(isRecord) as unknown as HelpArticle[]}
            rowKey={(row) => asString(row.id ?? row['id'])}
            loading={articlesQuery.isLoading}
            emptyTitle="Belum ada artikel"
            caption="Daftar artikel bantuan"
          />
          {articlesQuery.data ? (
            <ServerPagination pagination={articlesQuery.data.pagination} onPageChange={setPage} />
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={dialogOpen}
        title={editing ? 'Ubah Artikel' : 'Tambah Artikel'}
        confirmLabel="Simpan"
        busy={saveMutation.isPending}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
        }}
        onConfirm={() => saveMutation.mutate()}
      >
        <div className="mt-3 space-y-3">
          {formError ? (
            <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{formError}</p>
          ) : null}
          <div>
            <label className="label" htmlFor="help-title">Judul *</label>
            <input
              id="help-title"
              className="input"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div>
            <label className="label" htmlFor="help-category">Kategori</label>
            <select
              id="help-category"
              className="input"
              value={form.categoryId}
              onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
            >
              <option value="">— Tanpa kategori —</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="help-content">Isi artikel (teks biasa) *</label>
            <textarea
              id="help-content"
              className="input"
              rows={8}
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            />
            <p className="mt-1 text-xs text-slate-500">
              Konten dirender sebagai teks biasa; HTML tidak didukung demi keamanan.
            </p>
          </div>
        </div>
      </ConfirmDialog>
    </div>
  );
}
