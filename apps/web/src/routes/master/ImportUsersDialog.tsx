import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError, apiDownload } from '../../lib/api';
import { Icon } from '../../components/Icon';

interface ImportPreviewRow {
  row: number;
  username: string;
  displayName: string;
  roleCode: string;
  status: 'valid' | 'error';
  errors: string[];
}

interface ValidateResult {
  totalRows: number;
  validCount: number;
  errorCount: number;
  rows: ImportPreviewRow[];
}

interface ConfirmUser {
  row: number;
  username: string;
  displayName: string;
  temporaryPassword: string;
}

interface ConfirmResult {
  created: number;
  skipped: number;
  users: ConfirmUser[];
  skippedRows: ImportPreviewRow[];
}

interface ImportUsersDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: (message: string) => void;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Step = 'pick' | 'preview' | 'done';

function errorText(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Terjadi kesalahan tak terduga.';
}

async function downloadTemplate(): Promise<void> {
  const { blob, filename } = await apiDownload('/admin/users/import/template');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? 'template-import-pengguna.xlsx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Dialog tiga langkah: pilih file → pratinjau per baris → laporan hasil. */
export function ImportUsersDialog({ open, onClose, onImported }: ImportUsersDialogProps) {
  const queryClient = useQueryClient();
  const dialogRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ValidateResult | null>(null);
  const [result, setResult] = useState<ConfirmResult | null>(null);

  useEffect(() => {
    if (!open) {
      setStep('pick');
      setFile(null);
      setError(null);
      setPreview(null);
      setResult(null);
      return;
    }
    const dialog = dialogRef.current;
    const first = dialog?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const pickFile = (f: File | null) => {
    setFile(f);
    setError(null);
    setPreview(null);
    setStep('pick');
  };

  const runValidate = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const data = await api<ValidateResult>('/admin/users/import/validate', {
        method: 'POST',
        body: fd,
        isForm: true,
      });
      setPreview(data);
      setStep('preview');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const runConfirm = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const data = await api<ConfirmResult>('/admin/users/import/confirm', {
        method: 'POST',
        body: fd,
        isForm: true,
      });
      setResult(data);
      setStep('done');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const finish = () => {
    if (result && result.created > 0) {
      onImported(`Berhasil mengimpor ${result.created} pengguna.`);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-dialog-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
      >
        <h2 id="import-dialog-title" className="text-base font-semibold text-slate-900">
          Import Pengguna dari Excel
        </h2>

        {error ? (
          <p className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{error}</p>
        ) : null}

        {step === 'pick' ? (
          <div className="mt-3 space-y-3 text-sm text-slate-600">
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Unduh template, lalu isi data di sheet &quot;Pengguna&quot; mulai baris 2 (maksimal
                200 baris).
              </li>
              <li>Kolom wajib: Username, Nama Lengkap, Kode Role. Pilih nilai dari dropdown.</li>
              <li>Peserta magang (role INTERN) wajib mengisi Nomor Peserta, Direktorat, dan Tanggal Mulai.</li>
              <li>Klik Periksa File untuk melihat hasil validasi sebelum disimpan.</li>
            </ol>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void downloadTemplate().catch((err) => setError(errorText(err)))}
              >
                <span className="flex items-center gap-1.5"><Icon name="download" className="h-4 w-4" /> Unduh Template</span>
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                {file ? 'Ganti File' : 'Pilih File…'}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <p className="text-sm text-slate-700">
                File dipilih: <span className="font-medium">{file.name}</span>
              </p>
            ) : (
              <p className="text-sm text-slate-500">Belum ada file dipilih.</p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
                Batal
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void runValidate()}
                disabled={busy || !file}
              >
                {busy ? 'Memeriksa…' : 'Periksa File'}
              </button>
            </div>
          </div>
        ) : null}

        {step === 'preview' && preview ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-slate-700">
              Total {preview.totalRows} baris:{' '}
              <span className="font-medium text-green-700">{preview.validCount} siap diimpor</span>
              {', '}
              <span className="font-medium text-red-700">{preview.errorCount} bermasalah</span>
              {' '}(baris bermasalah dilewati saat penyimpanan).
            </p>
            <ul className="max-h-72 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {preview.rows.map((r) => (
                <li key={r.row} className="text-sm">
                  <span className="font-medium text-slate-900">Baris {r.row}</span>{' '}
                  <span className="text-slate-600">
                    {r.username || '(kosong)'} — {r.displayName || '(tanpa nama)'} — {r.roleCode || '-'}
                  </span>{' '}
                  {r.status === 'valid' ? (
                    <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-800">OK</span>
                  ) : (
                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-800">Gagal</span>
                  )}
                  {r.errors.length > 0 ? (
                    <span className="block text-xs text-red-700">{r.errors.join('; ')}</span>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => pickFile(null)} disabled={busy}>
                Kembali
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void runConfirm()}
                disabled={busy || preview.validCount === 0}
              >
                {busy ? 'Menyimpan…' : `Simpan ${preview.validCount} Pengguna`}
              </button>
            </div>
          </div>
        ) : null}

        {step === 'done' && result ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-slate-700" role="status">
              {result.created} pengguna berhasil dibuat, {result.skipped} baris dilewati.
            </p>
            {result.users.length > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-900">Password sementara (tampil sekali)</p>
                <ul className="mt-2 space-y-1.5">
                  {result.users.map((u) => (
                    <li key={u.username} className="text-sm text-amber-900">
                      <span className="font-medium">{u.username}</span> —{' '}
                      <span className="break-all font-mono text-xs">{u.temporaryPassword}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-amber-700">
                  Pengguna wajib mengganti password saat login pertama. Catat sekarang; tidak
                  ditampilkan lagi.
                </p>
              </div>
            ) : null}
            {result.skippedRows.length > 0 ? (
              <ul className="space-y-1 rounded-lg bg-red-50 p-2 text-sm text-red-700">
                {result.skippedRows.map((r) => (
                  <li key={r.row}>
                    Baris {r.row} ({r.username || '(kosong)'}): {r.errors.join('; ')}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex justify-end">
              <button type="button" className="btn-primary" onClick={finish}>
                Selesai
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
