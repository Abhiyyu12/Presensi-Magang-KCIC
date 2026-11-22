import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { LoadingState } from '../components/LoadingState';
import { ErrorState } from '../components/ErrorState';

/** Redirects unauthenticated users to /login, preserving the intended path. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, bootError, refresh } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingState label="Memuat sesi…" />;
  if (bootError) {
    return <ErrorState message={bootError} onRetry={() => void refresh()} />;
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

/**
 * Renders children only when the user has at least one of the given
 * permissions; otherwise redirects to the home dashboard (which always
 * renders something the user may see). Hiding navigation and buttons is UX;
 * the backend remains the enforcement point.
 */
export function RequirePermission({
  anyOf,
  children,
}: {
  anyOf: string | string[];
  children: ReactNode;
}) {
  const { user, loading, permissions } = useAuth();
  if (loading) return <LoadingState label="Memuat sesi…" />;
  if (!user) return <Navigate to="/login" replace />;
  const required = Array.isArray(anyOf) ? anyOf : [anyOf];
  // Users with no explicit permission requirement bypass.
  if (required.length === 0) return <>{children}</>;
  const allowed = required.some((perm) => permissions.has(perm));
  if (!allowed) return <Navigate to="/" replace />;
  return <>{children}</>;
}
