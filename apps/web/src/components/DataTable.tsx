import type { ReactNode } from 'react';
import { EmptyState } from './EmptyState';
import { LoadingState } from './LoadingState';

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  caption?: string;
}

/**
 * Generic server-data table. Scrolls inside a bordered container (both axes)
 * with a sticky header, so no column is silently hidden on mobile.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  onRowClick,
  emptyTitle,
  emptyDescription,
  caption,
}: DataTableProps<T>) {
  if (loading) return <LoadingState />;
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <div>
      <p className="mb-1 text-xs text-stone-500 sm:hidden" aria-hidden="true">
        Geser tabel ke samping untuk melihat semua kolom
      </p>
      <div className="max-h-[70vh] overflow-auto rounded-xl border border-stone-200 bg-white shadow-sm">
        <table className="table-stagger min-w-full divide-y divide-stone-200 text-sm">
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead className="bg-stone-50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.header}
                  scope="col"
                  className={`sticky top-0 z-10 whitespace-nowrap border-b border-stone-200 bg-stone-50 px-3 py-2.5 text-left text-xs font-semibold text-stone-500 ${col.className ?? ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((row) => {
              const key = rowKey(row);
              const clickable = Boolean(onRowClick);
              return (
                <tr
                  key={key}
                  className={`transition-colors duration-150 ${clickable ? 'cursor-pointer hover:bg-brand-50' : 'hover:bg-stone-50'}`}
                  onClick={clickable ? () => onRowClick?.(row) : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onRowClick?.(row);
                          }
                        }
                      : undefined
                  }
                  aria-label={clickable ? 'Buka detail baris' : undefined}
                >
                  {columns.map((col) => (
                    <td
                      key={col.header}
                      className={`whitespace-nowrap px-3 py-2.5 text-stone-700 ${col.className ?? ''}`}
                    >
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
