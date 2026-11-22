// Taksonomi pohon permission (Menu → Submenu → Fitur/Aksi) dan template role
// untuk halaman Pengguna & Hak Akses. Daftar kode di sini adalah peta UI; sumber
// kebenaran permission tetap tabel permissions di DB — kode yang tidak ada di DB
// diabaikan, dan permission DB yang tidak terpetakan masuk grup "Lainnya".

export interface TaxonomySubmenu {
  key: string;
  label: string;
  permissionCodes: string[];
}

export interface TaxonomyMenu {
  key: string;
  label: string;
  submenus: TaxonomySubmenu[];
}

export const PERMISSION_TAXONOMY: TaxonomyMenu[] = [
  {
    key: 'beranda',
    label: 'Beranda & Bantuan',
    submenus: [
      { key: 'dashboard', label: 'Beranda', permissionCodes: ['dashboard:view'] },
      { key: 'bantuan', label: 'Pusat Bantuan', permissionCodes: ['help:view', 'admin:help:manage'] },
    ],
  },
  {
    key: 'absensi',
    label: 'Absensi',
    submenus: [
      { key: 'pribadi', label: 'Absensi Pribadi', permissionCodes: ['attendance:submit', 'attendance:view:own'] },
      { key: 'pemantauan', label: 'Pemantauan & Koreksi', permissionCodes: ['attendance:view:scoped', 'attendance:evidence:view', 'attendance:correct'] },
    ],
  },
  {
    key: 'izin',
    label: 'Izin',
    submenus: [
      { key: 'pribadi', label: 'Izin Pribadi', permissionCodes: ['leave:request', 'leave:view:own', 'leave:cancel:approved'] },
      { key: 'persetujuan', label: 'Persetujuan Izin', permissionCodes: ['leave:view:scoped', 'leave:approve'] },
    ],
  },
  {
    key: 'laporan',
    label: 'Laporan',
    submenus: [
      { key: 'laporan', label: 'Laporan & Ekspor', permissionCodes: ['report:view', 'report:export'] },
    ],
  },
  {
    key: 'master',
    label: 'Data Master',
    submenus: [
      { key: 'pengguna', label: 'Pengguna', permissionCodes: ['admin:users:manage', 'admin:assignments:manage'] },
      { key: 'organisasi', label: 'Organisasi & Penempatan', permissionCodes: ['admin:org:manage', 'admin:placements:manage'] },
      { key: 'operasional', label: 'Jadwal & Operasional', permissionCodes: ['admin:schedules:manage', 'admin:calendar:manage', 'admin:leave-categories:manage', 'admin:params:manage'] },
    ],
  },
  {
    key: 'akses',
    label: 'Akses & Keamanan',
    submenus: [
      { key: 'role', label: 'Role & Permission', permissionCodes: ['access:roles:manage', 'access:permissions:view', 'access:simulate'] },
      { key: 'kebijakan', label: 'Feature Tree, Policy & Scope', permissionCodes: ['access:feature-tree:manage', 'access:policies:manage', 'access:scopes:manage'] },
    ],
  },
  {
    key: 'audit',
    label: 'Audit',
    submenus: [
      { key: 'audit', label: 'Jejak Audit', permissionCodes: ['admin:audit:view'] },
    ],
  },
];

export interface RoleTemplate {
  key: string;
  name: string;
  description: string;
  permissionCodes: string[];
}

const allTaxonomyCodes = PERMISSION_TAXONOMY.flatMap((m) => m.submenus.flatMap((s) => s.permissionCodes));

const SUPERVISOR_TEMPLATE_CODES = [
  'attendance:view:scoped', 'attendance:evidence:view',
  'leave:view:scoped', 'report:view', 'report:export',
  'dashboard:view', 'help:view',
];

const INTERN_TEMPLATE_CODES = [
  'attendance:submit', 'attendance:view:own', 'attendance:evidence:view',
  'leave:request', 'leave:view:own', 'dashboard:view', 'help:view',
];

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    key: 'administrator',
    name: 'Administrator',
    description: 'Akses penuh: semua menu dan aksi.',
    permissionCodes: allTaxonomyCodes,
  },
  {
    key: 'pembimbing',
    name: 'Pembimbing',
    description: 'Monitoring absensi, izin peserta, laporan, dan ekspor.',
    permissionCodes: SUPERVISOR_TEMPLATE_CODES,
  },
  {
    key: 'peserta',
    name: 'Peserta',
    description: 'Absen, ajukan izin, lihat riwayat sendiri.',
    permissionCodes: INTERN_TEMPLATE_CODES,
  },
];
