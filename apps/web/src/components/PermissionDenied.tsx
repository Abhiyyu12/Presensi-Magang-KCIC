export function PermissionDenied() {
  return (
    <div className="card border-amber-200 bg-amber-50" role="alert">
      <p className="text-sm font-semibold text-amber-900">Akses ditolak</p>
      <p className="mt-1 text-sm text-amber-800">
        Anda tidak memiliki akses untuk melihat data ini.
      </p>
    </div>
  );
}
