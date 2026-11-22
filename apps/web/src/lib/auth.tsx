import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError, setUnauthorizedHandler, clearCsrfCache } from './api';
import type { AuthUser } from './types';

// AuthProvider: session lives in an HttpOnly cookie server-side; nothing is
// stored in localStorage. On mount we silently GET /auth/me.

interface AuthContextValue {
  user: AuthUser | null;
  permissions: Set<string>;
  roles: Set<string>;
  loading: boolean;
  bootError: string | null;
  has: (permission: string) => boolean;
  hasRole: (role: string) => boolean;
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface LoginResponse {
  user?: AuthUser;
  csrfToken?: string;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);

  const fetchMe = useCallback(async (): Promise<AuthUser | null> => {
    try {
      // /auth/me returns { user: ... } inside the envelope.
      const data = await api<{ user: AuthUser }>('/auth/me');
      setUser(data.user ?? null);
      setBootError(null);
      return data.user ?? null;
    } catch (error) {
      setUser(null);
      // Only a real 401 means "not signed in". Network/server failures must
      // surface an error state, not silently redirect to the login page.
      if (error instanceof ApiError && error.status === 401) {
        setBootError(null);
      } else {
        setBootError(
          error instanceof ApiError
            ? error.message
            : 'Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.',
        );
      }
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await fetchMe();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchMe]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<AuthUser> => {
    clearCsrfCache();
    const data = await api<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { username, password },
    });
    let nextUser = data.user ?? null;
    if (!nextUser) {
      nextUser = await fetchMe();
    }
    if (!nextUser) {
      throw new ApiError('LOGIN_FAILED', 'Gagal memuat data pengguna setelah login.', 500);
    }
    setUser(nextUser);
    return nextUser;
  }, [fetchMe]);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await api<null>('/auth/logout', { method: 'POST' });
    } catch {
      // Even if logout call fails, clear local state; cookie expiry is server-side.
    }
    clearCsrfCache();
    setUser(null);
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    await fetchMe();
  }, [fetchMe]);

  const permissions = useMemo(
    () => new Set<string>(user?.permissions ?? []),
    [user],
  );
  const roles = useMemo(
    () => new Set<string>((user?.roles ?? []).map((r) => r.code)),
    [user],
  );

  const has = useCallback((permission: string) => permissions.has(permission), [permissions]);
  const hasRole = useCallback((role: string) => roles.has(role), [roles]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, permissions, roles, loading, bootError, has, hasRole, login, logout, refresh }),
    [user, permissions, roles, loading, bootError, has, hasRole, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
