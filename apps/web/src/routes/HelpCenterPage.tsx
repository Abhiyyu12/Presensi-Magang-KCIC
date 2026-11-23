import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { api } from '../lib/api';
import { DURATION, EASE_OUT_EXPO } from '../lib/motion';
import type { HelpArticle, HelpCategory, Paginated } from '../lib/types';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';
import { EmptyState } from '../components/EmptyState';
import { ServerPagination } from '../components/ServerPagination';
import { FetchIndicator } from '../components/FetchIndicator';
import { useDebouncedValue } from '../hooks/useUiHelpers';

// Badge status tayang: teks tetap terbaca, warna hanya penguat.
function ArticleStatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  if (s === 'DRAFT') {
    return (
      <span className="chip-enter inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
        Draf
      </span>
    );
  }
  if (s === 'ARCHIVED') {
    return (
      <span className="chip-enter inline-flex items-center rounded-full border border-stone-200 bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600">
        Arsip
      </span>
    );
  }
  return null;
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

export function HelpCenterPage() {
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
        <div className="relative flex-1">
          <label className="label" htmlFor="help-search">
            Cari artikel
          </label>
          <div className="relative">
            <SearchIcon />
            <input
              id="help-search"
              type="search"
              className="input pl-9"
              maxLength={100}
              placeholder="Kata kunci…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
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
          <FetchIndicator show={articlesQuery.isFetching && !articlesQuery.isLoading} />
          <ul className="space-y-2">
            {(articlesQuery.data?.items ?? []).map((article) => {
              const open = expandedId === article.id;
              const status = article.status ?? 'PUBLISHED';
              return (
                <li key={article.id} className="card overflow-hidden p-0">
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    aria-expanded={open}
                    aria-controls={`help-body-${article.id}`}
                    onClick={() => setExpandedId(open ? null : article.id)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-stone-800">{article.title}</span>
                        <ArticleStatusBadge status={status} />
                      </span>
                      {!open ? (
                        <span className="mt-1 line-clamp-1 block text-xs text-stone-500">
                          {article.content}
                        </span>
                      ) : null}
                    </span>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className={`h-4 w-4 shrink-0 text-stone-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  <AnimatePresence initial={false}>
                    {open ? (
                      <motion.div
                        key="body"
                        id={`help-body-${article.id}`}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: DURATION.base, ease: EASE_OUT_EXPO }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-stone-100 px-4 py-3">
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-700">
                            {article.content}
                          </p>
                          <Link
                            to={`/bantuan/${article.slug}`}
                            className="mt-3 inline-flex min-h-touch items-center text-sm font-semibold text-brand-700 hover:underline"
                          >
                            Baca halaman lengkap
                          </Link>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </li>
              );
            })}
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
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-bold text-stone-900">{article.title}</h1>
          <ArticleStatusBadge status={article.status ?? 'PUBLISHED'} />
        </div>
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
