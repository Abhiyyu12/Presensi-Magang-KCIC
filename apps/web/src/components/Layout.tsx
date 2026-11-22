import { useMemo, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { EffectiveAccess, FeatureNode } from '../lib/types';
import { LoadingState } from './LoadingState';

interface NavItem {
  label: string;
  route: string;
}

function collectRoutes(nodes: FeatureNode[] | undefined, out: NavItem[] = []): NavItem[] {
  for (const node of nodes ?? []) {
    if (node.route && node.route.startsWith('/') && !out.some((i) => i.route === node.route)) {
      out.push({ label: node.label, route: node.route });
    }
    if (node.children?.length) collectRoutes(node.children, out);
  }
  return out;
}

/** Static fallback navigation keyed by permission (hiding menus is not security). */
function fallbackNav(has: (perm: string) => boolean): NavItem[] {
  const items: NavItem[] = [];
  if (has('attendance:submit')) {
    items.push(
      { label: 'Dashboard', route: '/' },
      { label: 'Absensi', route: '/absensi' },
      { label: 'Izin', route: '/izin' },
      { label: 'Riwayat', route: '/riwayat' },
    );
  }
  if (has('attendance:view:scoped') || has('report:view')) {
    items.push(
      { label: 'Monitoring', route: '/monitoring' },
      { label: 'Laporan', route: '/reports' },
    );
  }
  if (has('leave:approve')) items.push({ label: 'Approval Izin', route: '/approval' });
  if (has('admin:users:manage')) items.push({ label: 'Data Master', route: '/master' });
  if (has('access:roles:manage')) items.push({ label: 'Akses', route: '/access' });
  if (has('admin:audit:view')) items.push({ label: 'Audit', route: '/audit' });
  items.push({ label: 'Bantuan', route: '/bantuan' }, { label: 'Profil', route: '/profil' });
  return items.filter((item, idx, arr) => arr.findIndex((i) => i.route === item.route) === idx);
}

export function Layout() {
  const { user, has, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const accessQuery = useQuery({
    queryKey: ['access', 'me', 'effective'],
    queryFn: () => api<EffectiveAccess>('/access/me/effective'),
    enabled: !loading && user !== null,
    staleTime: 5 * 60_000,
  });

  const navItems = useMemo(() => {
    const fromTree = collectRoutes(accessQuery.data?.featureTree);
    if (fromTree.length > 0) {
      const extras: NavItem[] = [];
      if (!fromTree.some((i) => i.route === '/profil')) extras.push({ label: 'Profil', route: '/profil' });
      return [...fromTree, ...extras];
    }
    return fallbackNav(has);
  }, [accessQuery.data, has]);

  // Nav for the mobile bottom bar: first items, max 5, always include home.
  const bottomNav = navItems.slice(0, 5);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Memuat sesi…" />
      </div>
    );
  }

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen lg:flex">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-4">
          <NavLink to="/" className="flex items-center gap-2 font-bold text-slate-900">
            <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-sm text-white">
              P
            </span>
            <span>Presensi Magang KCIC</span>
          </NavLink>
          <div className="relative">
            <button
              type="button"
              className="btn-secondary px-3 py-1.5 text-xs"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              {user?.displayName ?? user?.username ?? 'Akun'}
              <span aria-hidden="true">▾</span>
            </button>
            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
              >
                <NavLink
                  to="/profil"
                  role="menuitem"
                  className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  onClick={() => setMenuOpen(false)}
                >
                  Profil / Akun
                </NavLink>
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-slate-50"
                  onClick={() => void handleLogout()}
                >
                  Keluar
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <nav
        aria-label="Navigasi utama (desktop)"
        className="hidden w-60 shrink-0 border-r border-slate-200 bg-white lg:block"
      >
        <ul className="space-y-1 p-3">
          {navItems.map((item) => (
            <li key={item.route}>
              <NavLink
                to={item.route}
                end={item.route === '/'}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2 text-sm font-medium ${
                    isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-700 hover:bg-slate-50'
                  }`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-24 pt-4 lg:pb-8">
        <Outlet />
      </main>

      <nav
        aria-label="Navigasi utama (mobile)"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white lg:hidden"
      >
        <ul className="flex">
          {bottomNav.map((item) => (
            <li key={item.route} className="flex-1">
              <NavLink
                to={item.route}
                end={item.route === '/'}
                className={({ isActive }) =>
                  `flex min-h-touch flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-medium ${
                    isActive ? 'text-brand-700' : 'text-slate-600'
                  }`
                }
              >
                <span aria-hidden="true" className="text-base">
                  {navIcon(item.route)}
                </span>
                <span className="truncate">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function navIcon(route: string): string {
  if (route === '/') return '⌂';
  if (route === '/absensi') return '📷';
  if (route === '/izin') return '🗒';
  if (route === '/riwayat') return '🕘';
  if (route === '/monitoring') return '👁';
  if (route === '/reports') return '📊';
  if (route === '/approval') return '✔';
  if (route === '/master') return '🗂';
  if (route === '/access') return '🔑';
  if (route === '/audit') return '🧾';
  if (route === '/bantuan') return '?';
  if (route === '/profil') return '👤';
  return '•';
}
