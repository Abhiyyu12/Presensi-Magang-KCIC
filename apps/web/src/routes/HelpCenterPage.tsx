import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { HelpArticle, HelpCategory, Paginated } from '../lib/types';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { ServerPagination } from '../components/ServerPagination';
import { useDebouncedValue } from '../hooks/useUiHelpers';

export function HelpCenterPage() {
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search.slice(0, 100), 400);

  const categoriesQuery = useQuery({
    queryKey: ['help', 'categories'],
    queryFn: () => api<HelpCategory[] | Paginated<HelpCategory>>('/help/categories'),
  });

  const articlesQuery = useQuery({
    queryKey: ['help', 'articles', debouncedSearch, categoryId, page],
    queryFn: () =>
      api<Paginated<HelpArticle>>('/help/articles', {
        query: {
          search: debouncedSearch || undefined,
          categoryId: categoryId || undefined,
          page,
          pageSize: 15,
        },
      }),
    placeholderData: (previous) => previous,
  });

  const categories = Array.isArray(categoriesQuery.data)
    ? categoriesQuery.data
    : (categoriesQuery.data?.items ?? []);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-bold text-stone-900">Pusat Bantuan</h1>
        <p className="text-sm text-stone-600">
          Panduan absensi dengan kamera dan lokasi, izin tengah hari, dan penggunaan aplikasi.
        </p>
      </header>

      <div className="card flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="label" htmlFor="help-search">
            Cari artikel
          </label>
          <input
            id="help-search"
            type="search"
            className="input"
            maxLength={100}
            placeholder="Kata kunci…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="sm:w-56">
          <label className="label" htmlFor="help-category">
            Kategori
          </label>
          <select
            id="help-category"
            className="input"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Semua kategori</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {articlesQuery.isError ? (
        <ErrorState
          message={articlesQuery.error instanceof Error ? articlesQuery.error.message : 'Gagal memuat.'}
          onRetry={() => void articlesQuery.refetch()}
        />
      ) : articlesQuery.isLoading ? (
        <LoadingState label="Memuat artikel…" />
      ) : (articlesQuery.data?.items ?? []).length === 0 ? (
        <EmptyState
          title="Artikel tidak ditemukan"
          description="Coba kata kunci lain atau pilih kategori berbeda."
        />
      ) : (
        <>
          <ul className="space-y-2">
            {(articlesQuery.data?.items ?? []).map((article) => (
              <li key={article.id}>
                <Link to={`/bantuan/${article.slug}`} className="card block hover:border-brand-600">
                  <p className="text-sm font-semibold text-stone-800">{article.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-stone-500">{article.content}</p>
                  {article.categoryName ? (
                    <p className="mt-1 text-[11px] text-brand-700">{article.categoryName}</p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
          {articlesQuery.data ? (
            <ServerPagination pagination={articlesQuery.data.pagination} onPageChange={setPage} />
          ) : null}
        </>
      )}
    </div>
  );
}

export function HelpArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const articleQuery = useQuery({
    queryKey: ['help', 'article', slug],
    queryFn: () => api<HelpArticle>(`/help/articles/${slug}`),
    enabled: Boolean(slug),
  });

  if (articleQuery.isLoading) return <LoadingState label="Memuat artikel…" />;
  if (articleQuery.isError || !articleQuery.data) {
    return (
      <ErrorState
        message={articleQuery.error instanceof Error ? articleQuery.error.message : 'Artikel tidak ditemukan.'}
        onRetry={() => void articleQuery.refetch()}
      />
    );
  }

  const article = articleQuery.data;
  return (
    <article className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-lg font-bold text-stone-900">{article.title}</h1>
        {article.categoryName ? (
          <p className="text-xs text-brand-700">{article.categoryName}</p>
        ) : null}
      </header>
      {/* Plain-text rendering only — never dangerouslySetInnerHTML. */}
      <div className="card whitespace-pre-wrap text-sm leading-relaxed text-stone-700">
        {article.content}
      </div>
      <Link to="/bantuan" className="btn-secondary">
        Kembali ke Pusat Bantuan
      </Link>
    </article>
  );
}
