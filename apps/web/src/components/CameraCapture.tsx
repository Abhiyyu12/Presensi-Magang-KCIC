import { useCallback, useEffect, useRef, useState } from 'react';

// Camera state machine per DESIGN.md §5:
// idle → requesting_permission → preview_ready → captured → uploading → completed
// error states: permission_denied, unavailable, upload_failed.
// Only live camera capture is supported — there is no gallery/file input.

export type CameraState =
  | 'idle'
  | 'requesting_permission'
  | 'preview_ready'
  | 'captured'
  | 'uploading'
  | 'upload_failed'
  | 'permission_denied'
  | 'unavailable'
  | 'completed';

interface CameraCaptureProps {
  onCaptured: (blob: Blob, previewUrl: string) => void;
  onRetake?: () => void;
  /** Set externally while the captured photo is being submitted. */
  uploadState?: 'uploading' | 'upload_failed' | 'completed' | null;
  uploadErrorMessage?: string;
}

export function CameraCapture({
  onCaptured,
  onRetake,
  uploadState = null,
  uploadErrorMessage,
}: CameraCaptureProps) {
  const [state, setState] = useState<CameraState>('idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stopStream, [stopStream]);

  useEffect(() => {
    if (uploadState === 'uploading') setState('uploading');
    else if (uploadState === 'upload_failed') setState('upload_failed');
    else if (uploadState === 'completed') setState('completed');
  }, [uploadState]);

  const startCamera = useCallback(async () => {
    stopStream();
    setPreviewUrl(null);
    setState('requesting_permission');
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('unavailable');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setState('preview_ready');
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'permission_denied' : 'unavailable');
    }
  }, [stopStream]);

  const capture = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setState('unavailable');
      return;
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setState('unavailable');
          return;
        }
        stopStream();
        const url = URL.createObjectURL(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        setState('captured');
        onCaptured(blob, url);
      },
      'image/jpeg',
      0.9,
    );
  }, [onCaptured, stopStream]);

  const retake = useCallback(() => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    onRetake?.();
    void startCamera();
  }, [onRetake, startCamera]);

  const busy = state === 'uploading';

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-600">
        Izinkan akses kamera untuk mengambil selfie absensi.
      </p>

      <div className="relative overflow-hidden rounded-xl bg-slate-900">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          aria-label="Pratinjau kamera"
          className={`aspect-[4/3] w-full object-cover ${
            state === 'preview_ready' || state === 'uploading' ? '' : 'hidden'
          }`}
        />
        {previewUrl && state !== 'preview_ready' && state !== 'requesting_permission' ? (
          <img
            src={previewUrl}
            alt="Hasil foto absensi"
            className={`aspect-[4/3] w-full object-cover ${busy ? 'opacity-60' : ''}`}
          />
        ) : null}

        {state === 'idle' ? (
          <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 p-4 text-center">
            <p className="text-sm text-slate-300">
              Kamera akan diminta setelah Anda menekan tombol di bawah. Pastikan wajah terlihat
              jelas dan pencahayaan cukup.
            </p>
            <button type="button" className="btn-primary" onClick={() => void startCamera()}>
              Buka Kamera
            </button>
          </div>
        ) : null}

        {state === 'requesting_permission' ? (
          <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 p-4">
            <span
              className="h-6 w-6 animate-spin rounded-full border-2 border-slate-500 border-t-white"
              aria-hidden="true"
            />
            <p className="text-sm text-slate-300" role="status">
              Menunggu izin kamera…
            </p>
          </div>
        ) : null}

        {state === 'permission_denied' ? (
          <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 p-4 text-center">
            <p className="text-sm font-semibold text-red-300">Izin kamera ditolak</p>
            <p className="text-sm text-slate-300">
              Buka pengaturan situs di browser Anda, izinkan akses kamera untuk halaman ini, lalu
              coba lagi.
            </p>
            <button type="button" className="btn-secondary" onClick={() => void startCamera()}>
              Coba Lagi
            </button>
          </div>
        ) : null}

        {state === 'unavailable' ? (
          <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 p-4 text-center">
            <p className="text-sm font-semibold text-red-300">Kamera tidak tersedia</p>
            <p className="text-sm text-slate-300">
              Pastikan perangkat memiliki kamera dan tidak sedang digunakan aplikasi lain. Kamera
              hanya berfungsi pada HTTPS atau localhost. Coba lagi setelah memeriksa perangkat.
            </p>
            <button type="button" className="btn-secondary" onClick={() => void startCamera()}>
              Coba Lagi
            </button>
          </div>
        ) : null}

        {state === 'uploading' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/70 p-4 text-center">
            <span
              className="h-6 w-6 animate-spin rounded-full border-2 border-slate-500 border-t-white"
              aria-hidden="true"
            />
            <p className="text-sm text-white" role="status" aria-live="polite">
              Mengirim bukti absensi… Jangan tutup halaman sampai proses selesai.
            </p>
          </div>
        ) : null}

        {state === 'completed' ? (
          <div className="absolute inset-x-0 bottom-0 bg-green-700/90 p-2 text-center">
            <p className="text-sm font-semibold text-white" role="status">
              Absensi berhasil disimpan.
            </p>
          </div>
        ) : null}
      </div>

      {state === 'upload_failed' ? (
        <p className="text-sm text-red-600" role="alert">
          {uploadErrorMessage ?? 'Pengiriman gagal.'} Foto Anda masih tersimpan di halaman ini;
          gunakan tombol Kirim Ulang (kunci idempotensi mencegah duplikasi).
        </p>
      ) : null}

      <div className="flex gap-2">
        {state === 'preview_ready' ? (
          <button type="button" className="btn-primary flex-1" onClick={capture}>
            Ambil Foto
          </button>
        ) : null}
        {(state === 'captured' || state === 'upload_failed') && !busy ? (
          <button type="button" className="btn-secondary flex-1" onClick={retake}>
            Ambil Ulang Foto
          </button>
        ) : null}
      </div>
    </div>
  );
}
