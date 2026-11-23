// Garis tipis di atas tabel saat data menyegarkan (filter/pagination):
// data lama tetap tampil (placeholderData), indikator ini pengganti flicker.
export function FetchIndicator({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div
      className="h-0.5 w-full overflow-hidden rounded-full bg-stone-200"
      role="status"
      aria-label="Memperbarui data"
    >
      <div className="fetch-bar h-full w-1/3 rounded-full bg-brand-700" />
    </div>
  );
}
