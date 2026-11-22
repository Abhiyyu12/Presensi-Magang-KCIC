export function LoadingState({ label = 'Memuat data…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-10" role="status" aria-live="polite">
      <span
        className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-brand-700"
        aria-hidden="true"
      />
      <span className="text-sm text-slate-600">{label}</span>
    </div>
  );
}
