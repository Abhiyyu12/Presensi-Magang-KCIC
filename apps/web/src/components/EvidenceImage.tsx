import { useState } from 'react';
import { API_BASE } from '../lib/api';

interface EvidenceImageProps {
  attendanceId: string;
  eventId: string;
  alt: string;
  className?: string;
}

/** Bukti selfie disajikan langsung oleh API (same-origin, cookie sesi) — bucket MinIO tetap privat. */
export function EvidenceImage({ attendanceId, eventId, alt, className }: EvidenceImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <p className="text-xs text-red-600" role="alert">
        Bukti foto tidak dapat dimuat.
      </p>
    );
  }
  return (
    <img
      src={`${API_BASE}/attendance/${attendanceId}/evidence?eventId=${eventId}`}
      alt={alt}
      onError={() => setFailed(true)}
      className={`rounded-lg border border-stone-200 bg-stone-100 object-cover ${className ?? 'h-24 w-24'}`}
    />
  );
}
