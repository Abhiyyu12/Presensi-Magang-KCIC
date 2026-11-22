interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({ message, onRetry, retryLabel = 'Coba lagi' }: ErrorStateProps) {
  return (
    <div className="card border-red-200 bg-red-50" role="alert">
      <p className="text-sm font-semibold text-red-800">Gagal memuat data</p>
      <p className="mt-1 text-sm text-red-700">{message}</p>
      {onRetry ? (
        <button type="button" className="btn-danger mt-3" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
