import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-4xl font-bold text-slate-900">404</p>
      <h1 className="text-lg font-semibold text-slate-800">Halaman tidak ditemukan</h1>
      <p className="max-w-sm text-sm text-slate-600">
        Halaman yang Anda cari tidak tersedia. Periksa kembali alamat atau kembali ke beranda.
      </p>
      <Link to="/" className="btn-primary mt-2">
        Kembali ke Beranda
      </Link>
    </div>
  );
}
