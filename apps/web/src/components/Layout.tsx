import { useMemo, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { EffectiveAccess, FeatureNode } from '../lib/types';
import { LoadingState } from './LoadingState';
import { MenuIcon, NavIcon } from './NavIcon';

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
      { label: 'Beranda', route: '/' },
      { label: 'Absen', route: '/absensi' },
      { label: 'Izin', route: '/izin' },
      { label: 'Riwayat', route: '/riwayat' },
    );
  }
  if (has('attendance:view:scoped') || has('report:view')) {
    items.push({ label: 'Monitoring', route: '/monitoring' });
    if (has('leave:view:scoped') && !has('leave:request')) {
      items.push({ label: 'Izin Peserta', route: '/izin' });
    }
    items.push({ label: 'Laporan', route: '/reports' });
  }
  if (has('leave:approve')) items.push({ label: 'Approval', route: '/approval' });
  if (has('admin:users:manage')) items.push({ label: 'Data Master', route: '/master' });
  if (has('access:roles:manage')) items.push({ label: 'Akses', route: '/access' });
  if (has('admin:audit:view')) items.push({ label: 'Audit', route: '/audit' });
  items.push({ label: 'Bantuan', route: '/bantuan' }, { label: 'Profil', route: '/profil' });
  return items.filter((item, idx, arr) => arr.findIndex((i) => i.route === item.route) === idx);
}

const BOTTOM_SLOTS = 4;

export function Layout() {
  const { user, has, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const accessQuery = useQuery({
    queryKey: ['access', 'me', 'effective'],
    queryFn: () => api<EffectiveAccess>('/access/me/effective'),
    enabled: !loading && user !== null,
    staleTime: 5 * 60_000,
  });

  const navItems = useMemo(() => {
    const fromTree = collectRoutes(accessQuery.data?.featureTree).filter(
      // Approver already manages leaves via /approval; the read-only list is for supervisors.
      (i) => !(i.route === '/izin' && i.label === 'Izin Peserta' && has('leave:approve')),
    );
    const base = fromTree.length > 0 ? fromTree : fallbackNav(has);
    if (!base.some((i) => i.route === '/profil')) base.push({ label: 'Profil', route: '/profil' });
    return base;
  }, [accessQuery.data, has]);

  const { primary, secondary } = useMemo(() => {
    const prim = navItems.filter((i) => i.route !== '/profil');
    const sec = navItems.filter((i) => i.route === '/profil');
    if (prim.length > 6) {
      const help = prim.find((i) => i.route === '/bantuan');
      if (help) {
        prim.splice(prim.indexOf(help), 1);
        sec.unshift(help);
      }
    }
    return { primary: prim, secondary: sec };
  }, [navItems]);

  const bottomItems = primary.slice(0, BOTTOM_SLOTS);
  const sheetItems = navItems;
  const hasOverflow = navItems.length > bottomItems.length;

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

  const linkClass = (isActive: boolean) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
      isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-700 hover:bg-slate-50'
    }`;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-4">
          <NavLink to="/" className="flex min-w-0 items-center gap-2 font-bold text-slate-900">
            <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-700 text-sm text-white">
              P
            </span>
            <span className="truncate">Presensi Magang KCIC</span>
          </NavLink>
          <div className="relative shrink-0">
            <button
              type="button"
              className="btn-secondary max-w-[11rem] px-3 py-1.5 text-xs"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span className="truncate">{user?.displayName ?? user?.username ?? 'Akun'}</span>
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

      <div className="mx-auto max-w-7xl lg:flex">
        <nav
          aria-label="Navigasi utama (desktop)"
          className="hidden w-60 shrink-0 border-r border-slate-200 bg-white lg:block"
        >
          <ul className="space-y-1 p-3">
            {primary.map((item) => (
              <li key={item.route}>
                <NavLink to={item.route} end={item.route === '/'} className={({ isActive }) => linkClass(isActive)}>
                  <NavIcon route={item.route} />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
          {secondary.length > 0 ? (
            <>
              <p className="px-6 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Lainnya
              </p>
              <ul className="space-y-1 p-3 pt-0">
                {secondary.map((item) => (
                  <li key={item.route}>
                    <NavLink to={item.route} end={item.route === '/'} className={({ isActive }) => linkClass(isActive)}>
                      <NavIcon route={item.route} />
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </nav>

        <main className="w-full min-w-0 flex-1 px-4 pb-24 pt-4 lg:pb-8">
          <Outlet />
        </main>
      </div>

      <nav
        aria-label="Navigasi utama (mobile)"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white lg:hidden"
      >
        <ul className="flex">
          {bottomItems.map((item) => (
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
                <NavIcon route={item.route} />
                <span className="truncate">{item.label}</span>
              </NavLink>
            </li>
          ))}
          {hasOverflow ? (
            <li className="flex-1">
              <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={sheetOpen}
                onClick={() => setSheetOpen(true)}
                className={`flex min-h-touch w-full flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-medium ${
                  sheetOpen ? 'text-brand-700' : 'text-slate-600'
                }`}
              >
                <MenuIcon />
                <span>Menu</span>
              </button>
            </li>
          ) : null}
        </ul>
      </nav>

      {sheetOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Tutup menu"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setSheetOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu navigasi"
            className="absolute inset-x-0 bottom-0 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-white p-4 pb-8 shadow-xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800">Menu</p>
              <button type="button" className="btn-secondary px-3 py-1 text-xs" onClick={() => setSheetOpen(false)}>
                Tutup
              </button>
            </div>
            <ul className="grid grid-cols-2 gap-2">
              {sheetItems.map((item) => (
                <li key={item.route}>
                  <NavLink
                    to={item.route}
                    end={item.route === '/'}
                    onClick={() => setSheetOpen(false)}
                    className={({ isActive }) =>
                      `flex min-h-touch items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
                        isActive
                          ? 'border-brand-600 bg-brand-50 text-brand-800'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`
                    }
                  >
                    <NavIcon route={item.route} />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}