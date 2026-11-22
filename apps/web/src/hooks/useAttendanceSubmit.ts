import { useCallback, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { CheckResult, EventType } from '../lib/types';
import type { LocationFix } from '../components/LocationStatus';

// Orchestrates capture → location → confirm → submit for attendance and
// leave-movement posts. The Idempotency-Key is generated once per user intent
// and REUSED when retrying a failed submit; a new key is only created when the
// user starts a fresh attempt.

export type SubmitPhase = 'idle' | 'submitting' | 'success' | 'failed';

export interface SubmitInput {
  photo: Blob;
  /** Koordinat opsional: absen tetap dikirim saat GPS/izin lokasi gagal. */
  location: LocationFix | null;
  /** Optional endpoint override for leave movements. */
  endpoint?: string;
  /** Extra string fields for multipart bodies (leave movements etc.). */
  extraFields?: Record<string, string>;
}

interface UseAttendanceSubmitOptions {
  eventType: EventType | 'DEPARTURE' | 'RETURN' | 'EARLY_CHECKOUT';
  onSuccess?: (result: CheckResult) => void;
}

function defaultEndpoint(eventType: UseAttendanceSubmitOptions['eventType']): string {
  switch (eventType) {
    case 'CHECK_IN':
      return '/attendance/check-in';
    case 'CHECK_OUT':
      return '/attendance/check-out';
    case 'DEPARTURE':
    case 'RETURN':
    case 'EARLY_CHECKOUT':
      // Leave movement endpoints need the leave id; caller passes `endpoint`.
      return '';
  }
}

export function useAttendanceSubmit({ eventType, onSuccess }: UseAttendanceSubmitOptions) {
  const [phase, setPhase] = useState<SubmitPhase>('idle');
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const keyRef = useRef<string | null>(null);
  const inFlightRef = useRef(false);

  /** Start a brand-new user intent: fresh idempotency key, cleared state. */
  const beginAttempt = useCallback(() => {
    keyRef.current = crypto.randomUUID();
    setPhase('idle');
    setResult(null);
    setError(null);
  }, []);

  /**
   * Submit with the CURRENT key. Safe to call again after a network failure
   * (retry) — the same key prevents duplicate events server-side.
   */
  const submit = useCallback(
    async (input: SubmitInput): Promise<CheckResult | null> => {
      if (inFlightRef.current) return null; // double-submit guard
      if (!keyRef.current) keyRef.current = crypto.randomUUID();

      const form = new FormData();
      form.append('image', input.photo, 'selfie.jpg');
      if (input.location) {
        form.append('latitude', String(input.location.latitude));
        form.append('longitude', String(input.location.longitude));
        form.append('accuracyMeters', String(input.location.accuracyMeters));
      }
      form.append('clientSubmittedAt', new Date().toISOString());
      for (const [field, value] of Object.entries(input.extraFields ?? {})) {
        form.append(field, value);
      }

      inFlightRef.current = true;
      setPhase('submitting');
      setError(null);
      try {
        const data = await api<CheckResult>(input.endpoint ?? defaultEndpoint(eventType), {
          method: 'POST',
          body: form,
          isForm: true,
          idempotencyKey: keyRef.current,
        });
        setResult(data);
        setPhase('success');
        onSuccess?.(data);
        return data;
      } catch (err) {
        const apiError =
          err instanceof ApiError
            ? err
            : new ApiError('SUBMIT_FAILED', 'Pengiriman gagal. Coba lagi.', 0);
        setError(apiError);
        setPhase('failed');
        return null;
      } finally {
        inFlightRef.current = false;
      }
    },
    [eventType, onSuccess],
  );

  return { phase, result, error, submit, beginAttempt, idempotencyKey: keyRef };
}
