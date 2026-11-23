import type { Pagination } from '../lib/types';

const PAGE_SIZES = [10, 25, 50, 100];

interface ServerPaginationProps {
  pagination: Pagination;
  onPageChange: (page: number) => void;
  /** Ditampilkan hanya bila onPageSizeChange diberikan. */
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
}

/** Paginasi server: teks rentang x-y dari z, pemilih ukuran halaman, prev/next. */
export function ServerPagination({ pagination, onPageChange, pageSize, onPageSizeChange }: ServerPaginationProps) {
  const { page, pageSize: size, totalPages, total } = pagination;
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(page * size, total);
  return (
    <nav
      className="mt-3 flex flex-wrap items-center justify-between gap-2"
      aria-label="Paginasi data"
    >
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-stone-500" aria-live="polite">
          Menampilkan {from}&ndash;{to} dari {total} data
        </p>
        {onPageSizeChange ? (
          <label className="flex items-center gap-1 text-xs text-stone-500">
            Baris
            <select
              className="input w-auto py-1 text-xs"
              value={pageSize ?? size}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {totalPages > 1 ? (
        <p className="flex items-center gap-2">
          <span className="text-xs text-stone-500">
            Halaman {page} dari {totalPages}
          </span>
          <button
            type="button"
            className="btn-secondary px-3 py-1.5 text-xs"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Sebelumnya
          </button>
          <button
            type="button"
            className="btn-secondary px-3 py-1.5 text-xs"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Berikutnya
          </button>
        </p>
      ) : null}
    </nav>
  );
}
