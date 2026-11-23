import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { EffectiveAccess, FeatureNode, Leave, Paginated } from '../lib/types';
import { EASE_OUT_EXPO, SPRING } from '../lib/motion';
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
  if (has('access:roles:manage')) items.push({ label: 'Pengguna & Hak Akses', route: '/access' });
  if (has('admin:audit:view')) items.push({ label: 'Audit', route: '/audit' });
  items.push({ label: 'Bantuan', route: '/bantuan' }, { label: 'Profil', route: '/profil' });
  return items.filter((item, idx, arr) => arr.findIndex((i) => i.route === item.route) === idx);
}

// Pengelompokan menu (brief shell): satu grup per konteks penggunaan.
const ROUTE_GROUPS: Record<string, string> = {
  '/': 'Operasional',
  '/absensi': 'Operasional',
  '/izin': 'Operasional',
  '/riwayat': 'Operasional',
  '/monitoring': 'Operasional',
  '/approval': 'Operasional',
  '/reports': 'Operasional',
  '/master': 'Administrasi',
  '/access': 'Administrasi',
  '/audit': 'Administrasi',
  '/bantuan': 'Lainnya',
  '/profil': 'Lainnya',
};

const GROUP_ORDER = ['Operasional', 'Administrasi', 'Lainnya'];

function groupNav(items: NavItem[]): { label: string; items: NavItem[] }[] {
  return GROUP_ORDER.map((label) => ({
    label,
    items: items.filter((i) => (ROUTE_GROUPS[i.route] ?? 'Lainnya') === label),
  })).filter((g) => g.items.length > 0);
}

function initialsOf(name: string | undefined, fallback: string): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback.slice(0, 2).toUpperCase();
  return parts
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}

function roleLabel(user: { roles?: { code?: string; name?: string }[] } | null | undefined): string {
  const first = user?.roles?.[0];
  if (!first) return '';
  if (first.name && first.name.trim().length > 0) return first.name;
  return first.code ?? '';
}

const COLLAPSE_KEY = 'presensi.nav.collapsed';

export function Layout() {
  const { user, has, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const accessQuery = useQuery({
    queryKey: ['access', 'me', 'effective'],
    queryFn: () => api<EffectiveAccess>('/access/me/effective'),
    enabled: !loading && user !== null,
    staleTime: 5 * 60_000,
  });

  // Badge pengajuan menunggu di menu Approval — endpoint + queryKey yang sama
  // dengan halaman Approval supaya cache tumpang tindih.
  const pendingQuery = useQuery({
    queryKey: ['leaves', 'all', 'PENDING', 1, 1],
    queryFn: () =>
      api<Paginated<Leave>>('/leaves', {
        query: { scope: 'all', status: 'PENDING', page: 1, pageSize: 1 },
      }),
    enabled: !loading && user !== null && has('leave:approve'),
    staleTime: 60_000,
  });
  const pendingCount = pendingQuery.data?.pagination.total ?? 0;

  const navItems = useMemo(() => {
    const fromTree = collectRoutes(accessQuery.data?.featureTree).filter(
      // Approver already manages leaves via /approval; the read-only list is for supervisors.
      (i) => !(i.route === '/izin' && i.label === 'Izin Peserta' && has('leave:approve')),
    );
    const base = fromTree.length > 0 ? fromTree : fallbackNav(has);
    if (!base.some((i) => i.route === '/profil')) base.push({ label: 'Profil', route: '/profil' });
    return base;
  }, [accessQuery.data, has]);

  const groups = useMemo(() => groupNav(navItems), [navItems]);

  // Judul halaman untuk topbar: item nav dengan awalan rute terpanjang.
  const crumb = useMemo(() => {
    const matches = navItems.filter((i) =>
      i.route === '/' ? location.pathname === '/' : location.pathname.startsWith(i.route),
    );
    const longest = matches.sort((a, b) => b.route.length - a.route.length)[0];
    return longest ? { group: ROUTE_GROUPS[longest.route] ?? 'Lainnya', label: longest.label } : null;
  }, [navItems, location.pathname]);

  useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {
      // ignore storage failures (private mode)
    }
  }, [collapsed]);

  // Close transient overlays when switching routes.
  useEffect(() => {
    setDrawerOpen(false);
    setProfileMenuOpen(false);
  }, [location.pathname]);

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

  const displayName = user?.displayName ?? user?.username ?? 'Akun';
  const initials = initialsOf(user?.displayName, user?.username ?? 'A');

  const brandMark = (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-700 font-display text-sm font-bold text-white"
    >
      P
    </span>
  );

  const navLinkBase =
    'relative flex min-h-touch items-center gap-3 overflow-hidden rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150';

  function sidebarLink(item: NavItem, opts: { collapsed: boolean; animated: boolean }) {
    const showBadge = item.route === '/approval' && pendingCount > 0;
    return (
      <NavLink
        to={item.route}
        end={item.route === '/'}
        title={opts.collapsed ? item.label : undefined}
        className={({ isActive }) =>
          `${navLinkBase} ${isActive ? 'bg-brand-50 text-brand-800' : 'text-stone-700 hover:bg-stone-200/60'}`
        }
      >
        {({ isActive }) => (
          <>
            {isActive ? (
              opts.animated ? (
                <motion.span
                  layoutId="sidebar-active-desktop"
                  transition={SPRING}
                  className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-brand-700"
                  aria-hidden="true"
                />
              ) : (
                <span
                  className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-brand-700"
                  aria-hidden="true"
                />
              )
            ) : null}
            <span className="shrink-0" aria-hidden="true">
              <NavIcon route={item.route} />
            </span>
            <span
              className={`min-w-0 whitespace-nowrap transition-opacity duration-150 ${
                opts.collapsed ? 'opacity-0' : 'truncate opacity-100'
              }`}
            >
              {item.label}
            </span>
            {showBadge ? (
              opts.collapsed ? (
                <>
                  <span
                    className="chip-enter absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand-700"
                    aria-hidden="true"
                  />
                  <span className="sr-only">{pendingCount} pengajuan menunggu</span>
                </>
              ) : (
                <span className="chip-enter ml-auto rounded-full bg-brand-700 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                  {pendingCount}
                </span>
              )
            ) : null}
          </>
        )}
      </NavLink>
    );
  }

  const groupList = (collapsed: boolean, animated: boolean) => (
    <div className="space-y-1">
      {groups.map((group) => (
        <div key={group.label}>
          {collapsed ? (
            <div className="mx-3 my-2 h-px bg-stone-200" aria-hidden="true" />
          ) : (
            <p className="px-3 pb-1 pt-3 text-[11px] font-semibold text-stone-400">{group.label}</p>
          )}
          <ul className="space-y-1">
            {group.items.map((item) => (
              <li key={item.route}>{sidebarLink(item, { collapsed, animated })}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white shadow-[0_1px_3px_rgba(28,25,23,0.05)]">
        <div className="flex h-14 items-center justify-between gap-2 px-4">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="btn-secondary -ml-1 px-2 lg:hidden"
              aria-label="Buka menu navigasi"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(true)}
            >
              <MenuIcon />
            </button>
            <NavLink to="/" className="flex min-w-0 items-center gap-2 lg:hidden">
              {brandMark}
              <span className="truncate font-bold text-stone-900">Presensi Magang KCIC</span>
            </NavLink>
            {crumb ? (
              <nav aria-label="Lokasi halaman" className="hidden min-w-0 items-center gap-2 text-sm lg:flex">
                <span className="truncate text-stone-400">{crumb.group}</span>
                <span aria-hidden="true" className="text-stone-300">
                  /
                </span>
                <span className="truncate font-semibold text-stone-700">{crumb.label}</span>
              </nav>
            ) : null}
          </div>
          <div className="relative shrink-0">
            <button
              type="button"
              className="flex min-h-touch items-center gap-2 rounded-lg px-2 transition-colors duration-150 hover:bg-stone-100"
              aria-expanded={profileMenuOpen}
              aria-haspopup="menu"
              aria-label={`Menu akun ${displayName}`}
              onClick={() => setProfileMenuOpen((v) => !v)}
            >
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white"
              >
                {initials}
              </span>
              <span className="hidden min-w-0 flex-col items-start leading-tight sm:flex">
                <span className="max-w-[10rem] truncate text-sm font-semibold text-stone-800">{displayName}</span>
                <span className="max-w-[10rem] truncate text-[11px] text-stone-500">{roleLabel(user)}</span>
              </span>
              <span aria-hidden="true" className="text-stone-400">
                ▾
              </span>
            </button>
            <AnimatePresence>
              {profileMenuOpen ? (
                <motion.button
                  key="profile-menu-backdrop"
                  type="button"
                  aria-label="Tutup menu akun"
                  className="fixed inset-0 z-40 cursor-default"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1 }}
                  onClick={() => setProfileMenuOpen(false)}
                />
              ) : null}
              {profileMenuOpen ? (
                <motion.div
                  key="profile-menu"
                  role="menu"
                  initial={{ opacity: 0, scale: 0.96, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: 0.16, ease: EASE_OUT_EXPO } }}
                  exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.1, ease: 'easeOut' } }}
                  className="absolute right-0 z-50 mt-1 w-56 origin-top-right rounded-lg border border-stone-200 bg-white py-1 shadow-lg"
                >
                  <div className="flex items-center gap-3 border-b border-stone-100 px-4 py-3">
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white"
                    >
                      {initials}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-stone-800">{displayName}</span>
                      <span className="block truncate text-[11px] text-stone-500">{roleLabel(user)}</span>
                    </span>
                  </div>
                  <NavLink
                    to="/profil"
                    role="menuitem"
                    className="block px-4 py-2 text-sm text-stone-700 transition-colors hover:bg-stone-50"
                    onClick={() => setProfileMenuOpen(false)}
                  >
                    Profil / Akun
                  </NavLink>
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-4 py-2 text-left text-sm text-red-600 transition-colors hover:bg-stone-50"
                    onClick={() => void handleLogout()}
                  >
                    Keluar
                  </button>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Desktop sidebar: collapsible, dengan indikator aktif yang berpindah mulus. */}
        <nav
          aria-label="Navigasi utama"
          className={`sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 flex-col justify-between border-r border-stone-200 bg-white py-3 transition-[width] lg:flex ${
            collapsed ? 'w-[4.25rem]' : 'w-60'
          }`}
        >
          <div className={collapsed ? 'px-2' : 'px-3'}>
            <div
              className={`mb-2 flex items-center gap-2 border-b border-stone-200 pb-3 ${
                collapsed ? 'justify-center' : ''
              }`}
            >
              {brandMark}
              {!collapsed ? (
                <span className="min-w-0 leading-tight">
                  <span className="block truncate font-display text-sm font-bold text-stone-900">Presensi Magang</span>
                  <span className="block truncate text-[10px] text-stone-400">KCIC · Peserta Magang</span>
                </span>
              ) : null}
            </div>
            {groupList(collapsed, true)}
          </div>
          <div className="border-t border-stone-100 px-2 pt-2">
            <button
              type="button"
              className={`flex min-h-touch w-full items-center rounded-lg px-2 text-stone-500 transition-colors hover:bg-brand-50 hover:text-brand-700 ${
                collapsed ? 'justify-center' : 'gap-2'
              }`}
              aria-pressed={collapsed}
              title={collapsed ? 'Tampilkan menu' : 'Sembunyikan menu'}
              onClick={() => setCollapsed((v) => !v)}
            >
              <span aria-hidden="true" className={`shrink-0 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  <path d="M11 17l-5-5 5-5" />
                  <path d="M18 17l-5-5 5-5" />
                </svg>
              </span>
              {!collapsed ? (
                <span className="whitespace-nowrap text-xs font-semibold">Sembunyikan menu</span>
              ) : (
                <span className="sr-only">Tampilkan menu</span>
              )}
            </button>
          </div>
        </nav>

        <main key={location.pathname} className="page-enter w-full min-w-0 flex-1 px-4 pb-10 pt-4">
          <Outlet />
        </main>
      </div>

      {/* Mobile drawer: hamburger in the header, closes itself after picking a menu. */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Tutup menu navigasi"
            className="backdrop-enter absolute inset-0 bg-stone-900/40"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu navigasi"
            className="drawer-enter absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl"
          >
            <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-3">
              {brandMark}
              <span className="min-w-0 leading-tight">
                <span className="block truncate font-display text-sm font-bold text-stone-900">Presensi Magang</span>
                <span className="block truncate text-[10px] text-stone-400">KCIC · Peserta Magang</span>
              </span>
              <button
                type="button"
                className="btn-secondary ml-auto px-2 py-1 text-xs"
                aria-label="Tutup menu"
                onClick={() => setDrawerOpen(false)}
              >
                ✕
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3">{groupList(false, false)}</nav>
            <div className="border-t border-stone-100 p-3">
              <button
                type="button"
                className="btn-secondary w-full justify-start text-sm"
                onClick={() => {
                  setDrawerOpen(false);
                  void handleLogout();
                }}
              >
                Keluar
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
