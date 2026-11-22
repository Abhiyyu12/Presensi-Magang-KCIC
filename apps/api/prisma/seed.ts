/**
 * Deterministic, idempotent development seed. FAKE DATA ONLY.
 * Jam kerja, toleransi, dan kategori di bawah adalah DUMMY/konfigurasi development
 * (PENDING CONFIRMATION kebijakan KCIC) — bukan kebijakan resmi.
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/modules/auth/password.js';
import { businessDate, addDays, parseDateOnly } from '../src/common/time.js';

const db = new PrismaClient();

const DEV_PASSWORD = 'DevPassword123!'; // dummy local-dev only

const PERMISSIONS: { code: string; module: string; action: string; description: string }[] = [
  { code: 'attendance:submit', module: 'attendance', action: 'submit', description: 'Check-in/check-out sendiri' },
  { code: 'attendance:view:own', module: 'attendance', action: 'view', description: 'Lihat riwayat sendiri' },
  { code: 'attendance:view:scoped', module: 'attendance', action: 'view', description: 'Lihat absensi dalam scope' },
  { code: 'attendance:correct', module: 'attendance', action: 'correct', description: 'Koreksi absensi ber-audit' },
  { code: 'attendance:evidence:view', module: 'attendance', action: 'view', description: 'Lihat bukti selfie dalam scope' },
  { code: 'leave:request', module: 'leaves', action: 'request', description: 'Ajukan dan catat pergerakan izin' },
  { code: 'leave:view:own', module: 'leaves', action: 'view', description: 'Lihat izin sendiri' },
  { code: 'leave:view:scoped', module: 'leaves', action: 'view', description: 'Lihat izin dalam scope' },
  { code: 'leave:approve', module: 'leaves', action: 'approve', description: 'Approve/reject izin' },
  { code: 'leave:cancel:approved', module: 'leaves', action: 'cancel', description: 'Batalkan izin approved belum dipakai' },
  { code: 'report:view', module: 'reports', action: 'view', description: 'Lihat report dan statistik' },
  { code: 'report:export', module: 'reports', action: 'export', description: 'Ekspor CSV/XLSX' },
  { code: 'dashboard:view', module: 'dashboard', action: 'view', description: 'Lihat dashboard' },
  { code: 'admin:users:manage', module: 'master-data', action: 'manage', description: 'Kelola pengguna dan peserta' },
  { code: 'admin:org:manage', module: 'master-data', action: 'manage', description: 'Kelola biro dan divisi' },
  { code: 'admin:placements:manage', module: 'master-data', action: 'manage', description: 'Kelola lokasi penempatan' },
  { code: 'admin:assignments:manage', module: 'master-data', action: 'manage', description: 'Kelola penugasan pembimbing' },
  { code: 'admin:schedules:manage', module: 'master-data', action: 'manage', description: 'Kelola jadwal' },
  { code: 'admin:calendar:manage', module: 'master-data', action: 'manage', description: 'Kelola kalender hari libur/pengecualian' },
  { code: 'admin:leave-categories:manage', module: 'master-data', action: 'manage', description: 'Kelola kategori izin' },
  { code: 'admin:params:manage', module: 'master-data', action: 'manage', description: 'Kelola parameter bisnis' },
  { code: 'admin:help:manage', module: 'help-center', action: 'manage', description: 'Kelola artikel Pusat Bantuan' },
  { code: 'admin:audit:view', module: 'audit', action: 'view', description: 'Lihat audit trail' },
  { code: 'access:roles:manage', module: 'access-control', action: 'manage', description: 'Kelola role dan permission' },
  { code: 'access:permissions:view', module: 'access-control', action: 'view', description: 'Lihat katalog permission' },
  { code: 'access:feature-tree:manage', module: 'access-control', action: 'manage', description: 'Kelola feature tree' },
  { code: 'access:policies:manage', module: 'access-control', action: 'manage', description: 'Kelola policy ABAC' },
  { code: 'access:scopes:manage', module: 'access-control', action: 'manage', description: 'Kelola admin scope' },
  { code: 'access:simulate', module: 'access-control', action: 'simulate', description: 'Simulasi permission (diagnostik)' },
  { code: 'help:view', module: 'help-center', action: 'view', description: 'Baca Pusat Bantuan' },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  INTERN: [
    'attendance:submit', 'attendance:view:own', 'attendance:evidence:view',
    'leave:request', 'leave:view:own', 'dashboard:view', 'help:view',
  ],
  SUPERVISOR: [
    'attendance:view:scoped', 'attendance:evidence:view', 'leave:view:scoped',
    'report:view', 'report:export', 'dashboard:view', 'help:view',
  ],
  ADMIN_HR: [
    'attendance:view:scoped', 'attendance:correct', 'attendance:evidence:view',
    'leave:view:scoped', 'leave:approve', 'leave:cancel:approved',
    'report:view', 'report:export', 'dashboard:view', 'help:view', 'admin:help:manage',
    'admin:users:manage', 'admin:org:manage', 'admin:placements:manage', 'admin:assignments:manage',
    'admin:schedules:manage', 'admin:calendar:manage', 'admin:leave-categories:manage',
    'admin:params:manage', 'admin:audit:view',
  ],
  // Administrator IT: governance only. Akses operasional harus diberikan eksplisit.
  ADMIN_IT: [
    'access:roles:manage', 'access:permissions:view', 'access:feature-tree:manage',
    'access:policies:manage', 'access:scopes:manage', 'access:simulate',
    'admin:audit:view', 'dashboard:view', 'help:view',
  ],
};

const FEATURE_NODES: { code: string; label: string; route: string | null; nodeType: 'GROUP' | 'PAGE'; requiredPermissionCode: string | null; sortOrder: number; parent?: string }[] = [
  { code: 'nav.dashboard', label: 'Beranda', route: '/', nodeType: 'PAGE', requiredPermissionCode: 'dashboard:view', sortOrder: 1 },
  { code: 'nav.attendance', label: 'Absen', route: '/absensi', nodeType: 'PAGE', requiredPermissionCode: 'attendance:submit', sortOrder: 2 },
  { code: 'nav.leaves', label: 'Izin', route: '/izin', nodeType: 'PAGE', requiredPermissionCode: 'leave:request', sortOrder: 3 },
  { code: 'nav.history', label: 'Riwayat', route: '/riwayat', nodeType: 'PAGE', requiredPermissionCode: 'attendance:view:own', sortOrder: 4 },
  { code: 'nav.monitoring', label: 'Monitoring', route: '/monitoring', nodeType: 'PAGE', requiredPermissionCode: 'attendance:view:scoped', sortOrder: 5 },
  { code: 'nav.leavesScoped', label: 'Izin Peserta', route: '/izin', nodeType: 'PAGE', requiredPermissionCode: 'leave:view:scoped', sortOrder: 6 },
  { code: 'nav.approvals', label: 'Approval', route: '/approval', nodeType: 'PAGE', requiredPermissionCode: 'leave:approve', sortOrder: 7 },
  { code: 'nav.reports', label: 'Laporan', route: '/reports', nodeType: 'PAGE', requiredPermissionCode: 'report:view', sortOrder: 8 },
  { code: 'nav.master', label: 'Data Master', route: '/master', nodeType: 'PAGE', requiredPermissionCode: 'admin:users:manage', sortOrder: 9 },
  { code: 'nav.access', label: 'Pengguna & Hak Akses', route: '/access', nodeType: 'PAGE', requiredPermissionCode: 'access:roles:manage', sortOrder: 10 },
  { code: 'nav.audit', label: 'Audit', route: '/audit', nodeType: 'PAGE', requiredPermissionCode: 'admin:audit:view', sortOrder: 11 },
  { code: 'nav.help', label: 'Bantuan', route: '/bantuan', nodeType: 'PAGE', requiredPermissionCode: 'help:view', sortOrder: 12 },
  { code: 'nav.profile', label: 'Profil', route: '/profil', nodeType: 'PAGE', requiredPermissionCode: null, sortOrder: 13 },
];

async function upsertPermissions() {
  for (const p of PERMISSIONS) {
    await db.permission.upsert({ where: { code: p.code }, update: { module: p.module, action: p.action, description: p.description }, create: p });
  }
}

async function upsertRoles() {
  const defs: { code: string; name: string; description: string }[] = [
    { code: 'INTERN', name: 'Peserta Magang', description: 'Peserta program magang' },
    { code: 'SUPERVISOR', name: 'Pembimbing', description: 'Pembimbing/supervisor peserta (default read-only)' },
    { code: 'ADMIN_HR', name: 'Admin Magang/HR', description: 'Admin operasional magang/HR' },
    { code: 'ADMIN_IT', name: 'Administrator IT', description: 'Governance role/permission/policy; operasional harus eksplisit' },
  ];
  for (const r of defs) {
    const role = await db.role.upsert({
      where: { code: r.code },
      update: { name: r.name, description: r.description, isSystem: true, status: 'ACTIVE' },
      create: { ...r, isSystem: true, status: 'ACTIVE' },
    });
    const wanted = ROLE_PERMISSIONS[r.code] ?? [];
    // Deterministic: remove grants not in catalog, add missing ones (new roles start empty by design).
    const existing = await db.rolePermission.findMany({ where: { roleId: role.id } });
    const existingCodes = new Set(existing.map((e) => e.permissionId));
    for (const rp of existing) {
      const perm = await db.permission.findUnique({ where: { id: rp.permissionId } });
      if (perm && !wanted.includes(perm.code)) await db.rolePermission.delete({ where: { id: rp.id } });
    }
    for (const code of wanted) {
      const perm = await db.permission.findUniqueOrThrow({ where: { code } });
      if (!existingCodes.has(perm.id)) {
        await db.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id, effect: 'ALLOW' } });
      }
    }
  }
}

async function upsertFeatureNodes() {
  for (const n of FEATURE_NODES) {
    await db.featureNode.upsert({
      where: { code: n.code },
      update: { label: n.label, route: n.route, nodeType: n.nodeType, requiredPermissionCode: n.requiredPermissionCode, sortOrder: n.sortOrder },
      create: { code: n.code, label: n.label, route: n.route, nodeType: n.nodeType, requiredPermissionCode: n.requiredPermissionCode, sortOrder: n.sortOrder },
    });
  }
}

async function ensureUser(
  username: string,
  displayName: string,
  password: string,
  roleCodes: string[],
  mustChangePassword: boolean,
  contact?: { email?: string; phone?: string },
) {
  const email = contact?.email ?? `${username}@kcic.example.com`;
  const phone = contact?.phone ?? null;
  const existing = await db.user.findUnique({ where: { username } });
  if (existing) {
    // Keep seeded accounts aligned with realistic dummy identities without
    // touching credentials (password/mustChangePassword stay as-is).
    return db.user.update({ where: { id: existing.id }, data: { displayName, email, ...(phone ? { phone } : {}) } });
  }
  const passwordHash = await hashPassword(password);
  const user = await db.user.create({
    data: { username, displayName, passwordHash, accountStatus: 'ACTIVE', mustChangePassword, email, ...(phone ? { phone } : {}) },
  });
  for (const code of roleCodes) {
    const role = await db.role.findUniqueOrThrow({ where: { code } });
    await db.userRoleAssignment.create({ data: { userId: user.id, roleId: role.id, validFrom: new Date(), assignedBy: 'seed' } });
  }
  return user;
}

async function seedUsers() {
  const bootstrapUsername = process.env.BOOTSTRAP_ADMIN_USERNAME || 'dev-admin';
  const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
  if (bootstrapPassword) {
    await ensureUser(bootstrapUsername, 'Ahmad Fauzi', bootstrapPassword, ['ADMIN_IT', 'ADMIN_HR'], true, {
      email: 'ahmad.fauzi@kcic.example.com',
      phone: '081234567801',
    });
  }
  const adminHr = await ensureUser('admin-hr', 'Ratna Wijaya', DEV_PASSWORD, ['ADMIN_HR'], false, {
    email: 'ratna.wijaya@kcic.example.com',
    phone: '081234567802',
  });
  await ensureUser('supervisor1', 'Budi Santoso', DEV_PASSWORD, ['SUPERVISOR'], false, {
    email: 'budi.santoso@kcic.example.com',
    phone: '081234567803',
  });
  await ensureUser('peserta1', 'Andi Prasetyo', DEV_PASSWORD, ['INTERN'], false, {
    email: 'andi.prasetyo@kcic.example.com',
    phone: '081234567804',
  });
  await ensureUser('peserta2', 'Siti Nurhaliza', DEV_PASSWORD, ['INTERN'], false, {
    email: 'siti.nurhaliza@kcic.example.com',
    phone: '081234567805',
  });
  await ensureUser('peserta3', 'Dewi Lestari', DEV_PASSWORD, ['INTERN'], false, {
    email: 'dewi.lestari@kcic.example.com',
    phone: '081234567806',
  });

  // Global admin scope for the seeded HR admin (dev convenience, managed via /admin/scopes).
  const existingScope = await db.adminScope.findFirst({ where: { userId: adminHr.id, scopeType: 'GLOBAL' } });
  if (!existingScope) {
    await db.adminScope.create({ data: { userId: adminHr.id, scopeType: 'GLOBAL', validFrom: new Date() } });
  }
  // Bootstrap admin also needs scope visibility when operating (dev only).
  const bootstrap = await db.user.findUnique({ where: { username: bootstrapUsername } });
  if (bootstrap) {
    const bs = await db.adminScope.findFirst({ where: { userId: bootstrap.id, scopeType: 'GLOBAL' } });
    if (!bs) await db.adminScope.create({ data: { userId: bootstrap.id, scopeType: 'GLOBAL', validFrom: new Date() } });
  }
}

async function seedOrganization() {
  const biro1 = await db.bureau.upsert({ where: { code: 'BIO-OPS' }, update: { name: 'Direktorat Operasi' }, create: { code: 'BIO-OPS', name: 'Direktorat Operasi', status: 'ACTIVE' } });
  const biro2 = await db.bureau.upsert({ where: { code: 'BIO-TEK' }, update: { name: 'Direktorat Teknik' }, create: { code: 'BIO-TEK', name: 'Direktorat Teknik', status: 'ACTIVE' } });
  const div1 = await db.division.upsert({ where: { bureauId_code: { bureauId: biro1.id, code: 'DIV-OPSDAL' } }, update: { name: 'Biro Operasi & Dengkel' }, create: { bureauId: biro1.id, code: 'DIV-OPSDAL', name: 'Biro Operasi & Dengkel', status: 'ACTIVE' } });
  await db.division.upsert({ where: { bureauId_code: { bureauId: biro2.id, code: 'DIV-TEKNIK' } }, update: { name: 'Biro Teknik' }, create: { bureauId: biro2.id, code: 'DIV-TEKNIK', name: 'Biro Teknik', status: 'ACTIVE' } });
  const placement = await db.placement.upsert({ where: { code: 'PLC-TEGALLUAR' }, update: { name: 'Depo Tegalluar', description: 'Depo operasi kereta cepat' }, create: { code: 'PLC-TEGALLUAR', name: 'Depo Tegalluar', description: 'Depo operasi kereta cepat', status: 'ACTIVE' } });

  const sup = await db.user.findUniqueOrThrow({ where: { username: 'supervisor1' } });
  const start = parseDateOnly(addDays(businessDate(new Date()), -30));
  const interns: [string, string][] = [['peserta1', 'MG-2026-001'], ['peserta2', 'MG-2026-002'], ['peserta3', 'MG-2026-003']];
  for (const [username, participantNumber] of interns) {
    const u = await db.user.findUniqueOrThrow({ where: { username } });
    const profile = await db.internProfile.upsert({
      where: { userId: u.id },
      update: { participantNumber, bureauId: biro1.id, divisionId: div1.id, placementId: placement.id, status: 'ACTIVE' },
      create: { userId: u.id, participantNumber, bureauId: biro1.id, divisionId: div1.id, placementId: placement.id, startDate: start, status: 'ACTIVE' },
    });
    const existingAssignment = await db.supervisorAssignment.findFirst({ where: { supervisorUserId: sup.id, internProfileId: profile.id, status: 'ACTIVE' } });
    if (!existingAssignment) {
      await db.supervisorAssignment.create({ data: { supervisorUserId: sup.id, internProfileId: profile.id, validFrom: start, status: 'ACTIVE', createdBy: 'seed' } });
    }
  }
}

async function seedSchedules() {
  // DUMMY schedule (Senin-Jumat 09:00-18:00, toleransi 15 menit) — PENDING konfirmasi KCIC.
  // Old installs used a "(dummy)" name suffix; normalize it instead of creating a duplicate.
  const existing = await db.workSchedule.findFirst({
    where: { name: { in: ['Jadwal Global Default (dummy)', 'Jadwal Global Default'] } },
  });
  if (existing) {
    if (existing.name !== 'Jadwal Global Default') {
      await db.workSchedule.update({ where: { id: existing.id }, data: { name: 'Jadwal Global Default' } });
    }
    return;
  }
  const validFrom = parseDateOnly(addDays(businessDate(new Date()), -60));
  await db.workSchedule.create({
    data: {
      name: 'Jadwal Global Default',
      scopeType: 'GLOBAL',
      scopeId: null,
      validFrom,
      timezone: 'Asia/Jakarta',
      status: 'ACTIVE',
      version: 1,
      days: {
        create: [
          { weekday: 1, isWorkingDay: true, startTime: '09:00', endTime: '18:00', lateToleranceMinutes: 15 },
          { weekday: 2, isWorkingDay: true, startTime: '09:00', endTime: '18:00', lateToleranceMinutes: 15 },
          { weekday: 3, isWorkingDay: true, startTime: '09:00', endTime: '18:00', lateToleranceMinutes: 15 },
          { weekday: 4, isWorkingDay: true, startTime: '09:00', endTime: '18:00', lateToleranceMinutes: 15 },
          { weekday: 5, isWorkingDay: true, startTime: '09:00', endTime: '18:00', lateToleranceMinutes: 15 },
          { weekday: 6, isWorkingDay: false },
          { weekday: 7, isWorkingDay: false },
        ],
      },
    },
  });
}

async function seedMasterData() {
  const categories: [string, string, number][] = [
    ['KAMPUS', 'Kampus (usulan)', 1],
    ['KESEHATAN', 'Kesehatan (usulan)', 2],
    ['KELUARGA', 'Keluarga (usulan)', 3],
    ['DINAS', 'Dinas (usulan)', 4],
    ['LAINNYA', 'Lainnya (usulan)', 5],
  ];
  for (const [code, name, sortOrder] of categories) {
    await db.leaveCategory.upsert({ where: { code }, update: { name, sortOrder }, create: { code, name, sortOrder, status: 'ACTIVE' } });
  }
  const params: [string, object, string][] = [
    ['late_tolerance_default_minutes', { value: 15, status: 'PENDING_KCIC_CONFIRMATION' }, 'Usulan default; dapat dioverride per jadwal'],
    ['default_workdays', { value: [1, 2, 3, 4, 5], status: 'PENDING_KCIC_CONFIRMATION' }, 'Usulan Senin-Jumat; sumber kebenaran adalah jadwal'],
  ];
  for (const [key, valueJson, description] of params) {
    await db.businessParameter.upsert({ where: { key }, update: { description }, create: { key, valueJson: valueJson as object, description } });
  }
}

async function seedHelp() {
  const cat = await db.helpCategory.upsert({ where: { code: 'UMUM' }, update: { name: 'Umum' }, create: { code: 'UMUM', name: 'Umum', sortOrder: 1, status: 'ACTIVE' } });
  const existing = await db.helpArticle.findUnique({ where: { slug: 'cara-absensi' } });
  if (!existing) {
    await db.helpArticle.create({
      data: {
        categoryId: cat.id,
        slug: 'cara-absensi',
        title: 'Cara Check-in dan Check-out',
        body: 'Buka menu Absensi, izinkan akses kamera dan lokasi, ambil selfie langsung dari kamera (tanpa upload galeri), konfirmasi, lalu kirim. Waktu resmi dicatat oleh server dalam WIB. Jika kamera atau lokasi gagal, absensi tidak dapat dikirim — coba lagi atau hubungi admin untuk prosedur koreksi ber-audit.',
        targetRolesJson: ['INTERN'],
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
  }
  const draft = await db.helpArticle.findUnique({ where: { slug: 'draf-kebijakan-izin' } });
  if (!draft) {
    await db.helpArticle.create({
      data: {
        categoryId: cat.id,
        slug: 'draf-kebijakan-izin',
        title: 'Kebijakan Izin (DRAF - menunggu konfirmasi)',
        body: 'Artikel ini masih draf dan tidak boleh terlihat oleh pengguna biasa sampai dipublikasikan admin.',
        status: 'DRAFT',
      },
    });
  }
}

async function main() {
  // Dummy data must never land in production silently; explicit opt-in required.
  if (process.env.NODE_ENV === 'production' && process.env.SEED_DEV_DATA !== 'true') {
    console.log('Seed dilewati: NODE_ENV=production dan SEED_DEV_DATA bukan "true".');
    return;
  }
  await upsertPermissions();
  await upsertRoles();
  await upsertFeatureNodes();
  await seedUsers();
  await seedOrganization();
  await seedSchedules();
  await seedMasterData();
  await seedHelp();
  console.log('Seed selesai (deterministik, idempoten, data dummy).');
}

main()
  .catch((e) => {
    console.error('Seed gagal:', e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
