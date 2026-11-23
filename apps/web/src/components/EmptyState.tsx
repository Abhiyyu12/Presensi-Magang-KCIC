import type { ReactNode } from 'react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({
  title = 'Belum ada data',
  description = 'Tidak ada data yang cocok dengan filter saat ini.',
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-stone-300 bg-white px-4 py-10 text-center">
      <p className="text-sm font-semibold text-stone-700">{title}</p>
      <p className="max-w-sm text-sm text-stone-500">{description}</p>
      {action}
    </div>
  );
}
