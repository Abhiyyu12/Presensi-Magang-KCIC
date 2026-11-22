import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { LoadingState } from './LoadingState';

interface EvidenceResponse {
  url: string;
  expiresInSeconds: number;
}

interface EvidenceImageProps {
  attendanceId: string;
  eventId: string;
  alt: string;
  className?: string;
}

/** Fetches a short-lived signed URL for evidence and renders it in an <img>. */
export function EvidenceImage({ attendanceId, eventId, alt, className }: EvidenceImageProps) {
  const evidenceQuery = useQuery({
    queryKey: ['evidence', attendanceId, eventId],
    queryFn: () =>
      api<EvidenceResponse>(`/attendance/${attendanceId}/evidence`, {
        query: { eventId },
      }),
    staleTime: 30_000,
  });

  if (evidenceQuery.isLoading) {
    return (
      <div className={`flex items-center justify-center rounded-lg bg-slate-100 ${className ?? 'h-24 w-24'}`}>
        <LoadingState label="" />
      </div>
    );
  }
  if (evidenceQuery.isError || !evidenceQuery.data?.url) {
    return (
      <p className="text-xs text-red-600" role="alert">
        Bukti foto tidak dapat dimuat.
      </p>
    );
  }
  return (
    <img
      src={evidenceQuery.data.url}
      alt={alt}
      className={`rounded-lg border border-slate-200 object-cover ${className ?? 'h-24 w-24'}`}
    />
  );
}
