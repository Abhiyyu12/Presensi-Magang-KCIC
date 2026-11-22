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
 * Generic server-data table. On mobile it scrolls horizontally inside a
 * bordered container so no column is silently hidden.
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
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead className="bg-slate-50">
          <tr>
            {columns.map((col) => (
              <th
                key={col.header}
                scope="col"
                className={`whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 ${col.className ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => {
            const key = rowKey(row);
            const clickable = Boolean(onRowClick);
            return (
              <tr
                key={key}
                className={clickable ? 'cursor-pointer hover:bg-brand-50' : undefined}
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
                    className={`whitespace-nowrap px-3 py-2.5 text-slate-700 ${col.className ?? ''}`}
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
  );
}
