interface SuccessNoticeProps {
  message: string;
  onDismiss?: () => void;
}

export function SuccessNotice({ message, onDismiss }: SuccessNoticeProps) {
  return (
    <div
      className="notice-enter flex items-start justify-between gap-2 rounded-lg border border-green-200 bg-green-50 p-3"
      role="status"
    >
      <p className="text-sm font-medium text-green-800">{message}</p>
      {onDismiss ? (
        <button
          type="button"
          className="min-h-touch shrink-0 rounded-lg px-2 text-sm font-semibold text-green-700 hover:bg-green-100"
          onClick={onDismiss}
          aria-label="Tutup pemberitahuan"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}