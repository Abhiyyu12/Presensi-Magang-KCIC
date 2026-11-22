import type { Pagination } from '../lib/types';

interface ServerPaginationProps {
  pagination: Pagination;
  onPageChange: (page: number) => void;
}

export function ServerPagination({ pagination, onPageChange }: ServerPaginationProps) {
  const { page, totalPages, total } = pagination;
  if (totalPages <= 1) {
    return (
      <p className="mt-3 text-xs text-slate-500" aria-live="polite">
        Total {total} data
      </p>
    );
  }
  return (
    <nav className="mt-3 flex items-center justify-between gap-2" aria-label="Paginasi data">
      <p className="text-xs text-slate-500" aria-live="polite">
        Halaman {page} dari {totalPages} · Total {total} data
      </p>
      <div className="flex gap-2">
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
      </div>
    </nav>
  );
}
