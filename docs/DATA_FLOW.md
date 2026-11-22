# DATA FLOW — Peta Halaman → API → Database

Dokumen ini adalah hasil audit integritas data (Fase A1–A5, 2026-11-22). Semua angka, status, nama, dan jadwal yang tampil di UI berasal dari REST API `/api/v1` yang membaca PostgreSQL/MinIO — tidak ada data bisnis yang di-hardcode di frontend. Pembuktian E2E (UI→DB→halaman lain, ubah DB→UI, kondisi gagal, keamanan) tercatat di `BUILD_LOG.md` bagian Fase A4.

## 1. Prinsip

1. **Frontend hanya merender transport shape** (`apps/web/src/lib/types.ts`); aturan bisnis ada di backend.
2. **Waktu otoritatif = server.** `occurredAtServer` diisi backend; `clientSubmittedAt` dari klien hanya metadata diagnostik (divalidasi ISO-8601, tidak pernah menentukan status telat).
3. **WorkdaySnapshot immutable** per peserta+tanggal (`workday_snapshots`): jadwal efektif dibekukan saat hari pertama kali dibuka, sehingga perubahan jadwal/parameter tidak mengubah riwayat.
4. **Setiap mutasi penting diaudit** ke `audit_events` (before/after), dan submit absensi/pergerakan izin wajib `Idempotency-Key` (`idempotency_records`).
5. **Tidak ada endpoint yang mengembalikan semua record**; pagination default 15, maksimum 100, sort allowlist, filter tervalidasi + ter-scope.

## 2. Peta per halaman

### Autentikasi & kerangka aplikasi

| Halaman/komponen | Endpoint | Tabel DB |
|---|---|---|
| Login (`LoginPage`) | `POST /auth/login`, `POST /auth/change-password` (wajib ganti saat `mustChangePassword`) | `users`, `sessions`, `user_role_assignments` |
| Boot sesi (`lib/auth.tsx`) | `GET /auth/me`, `GET /auth/csrf`, `POST /auth/logout` | `sessions`, `users`, roles/permissions |
| Navigasi (`Layout`) | `GET /access/me/effective` | `roles`, `role_permissions`, `permissions`, `user_permission_overrides`, `abac_policies`, `feature_nodes`, `admin_scopes`, `supervisor_assignments` |
| Profil (`ProfilePage`) | `GET /profile` (kini memuat roles, penugasan: nomor peserta/biro/divisi/penempatan/periode, pembimbing aktif, jadwal aktif via resolusi INDIVIDUAL > DIVISION > BUREAU > GLOBAL), `PATCH /profile` (**strict whitelist**: hanya `displayName`/`email`/`phone`; field lain → 400; email duplikat → 409; telepon wajib format Indonesia), `POST /auth/change-password` | `users`, `user_role_assignments`, `intern_profiles`, `supervisor_assignments`, `work_schedules`+`work_schedule_days` |

### Peserta (INTERN)

| Halaman | Endpoint | Tabel DB |
|---|---|---|
| Beranda (`ParticipantDashboardPage`) | `GET /attendance/today` | `workday_snapshots`, `attendance_days`, `attendance_events`, `leave_requests`, `work_schedules`+`work_schedule_days`, `calendar_days`, `business_parameters` |
| Absen (`AttendancePage`) | `GET /attendance/today`; `POST /attendance/check-in` / `check-out` (multipart `image` + GPS + Idempotency-Key) | sama + `file_objects` (MinIO), `idempotency_records`, `audit_events` |
| Riwayat (`HistoryPage`) | `GET /attendance` (filter tanggal/status, preset 7/30 hari/bulan ini); `GET /attendance/export` (CSV pribadi, href langsung) | `attendance_days`, `attendance_events`, `workday_snapshots`, `intern_profiles` |
| Detail absensi (`AttendanceDetailPage`) | `GET /attendance/:id`; bukti via `GET /attendance/:id/evidence` (presigned URL 120 dtk, diaudit) | `attendance_days`, `attendance_events`, `file_objects` |
| Izin (`LeavesPage`) | `GET /leaves`, `GET /leaves/categories` (kategori ACTIVE), `POST /leaves` | `leave_requests`, `leave_categories`, `intern_profiles` |
| Detail izin (`LeaveDetailPage`) | `GET /leaves/:id`; `POST /leaves/:id/cancel` / `departure` / `return` / `early-checkout` (selfie+GPS+idempotency) | `leave_requests`, `leave_events`, `attendance_days`/`attendance_events` (early-checkout), `file_objects` |
| Bantuan (`HelpCenterPage`) | `GET /help/categories`, `GET /help/articles`, `GET /help/articles/:slug` (hanya PUBLISHED) | `help_categories`, `help_articles` |

### Pembimbing (SUPERVISOR)

| Halaman | Endpoint | Tabel DB |
|---|---|---|
| Beranda (`SupervisorDashboardPage`) | `GET /dashboard/supervisor` | `supervisor_assignments`, `intern_profiles`, `attendance_days`, `leave_requests` |
| Monitoring (`MonitoringPage`) | `GET /attendance` (scope bimbingan; filter `bureauId`, `divisionId`, `search`, tanggal, status); dropdown filter dari `GET /admin/organizations/bureaus` + `divisions` | `attendance_days`, `attendance_events`, `intern_profiles`, `bureaus`, `divisions` |
| Izin peserta (`ApprovalsPage` shared) | `GET /leaves?status=PENDING` (scope), `POST /leaves/:id/approve` / `reject` (wajib catatan) | `leave_requests`, `audit_events` |
| Laporan (`ReportsPage`) | `GET /reports/attendance`; unduh `GET /reports/attendance/export?format=csv\|xlsx` (≤20.000 baris, tanpa foto/koordinat, diaudit) | `workday_snapshots`, `attendance_days`, `attendance_events`, `leave_requests`, `intern_profiles` |

### Admin (ADMIN_HR / ADMIN_IT)

| Halaman | Endpoint | Tabel DB |
|---|---|---|
| Beranda (`AdminDashboardPage`) | `GET /dashboard/admin` | agregat `attendance_days`, `leave_requests`, `intern_profiles`, `users` |
| Data Master → Pengguna (`UsersPanel`) | `GET/POST /admin/users`, `PATCH /admin/users/:id`, `PUT /admin/users/:id/roles`, `POST /admin/users/:id/password-reset-token` (token sekali tampil, diaudit); katalog role dari `GET /admin/roles` | `users`, `roles`, `user_role_assignments`, `password_reset_tokens` |
| Import Excel pengguna (`UsersPanel`) | `GET /admin/users/import/template` (xlsx + dropdown dari DB), `POST /admin/users/import/validate` (laporan per baris), `POST /admin/users/import/confirm` (buat user + profil + role, `mustChangePassword`) | `users`, `intern_profiles`, `bureaus`, `divisions`, `placements`, `roles`, `user_role_assignments`, `audit_events` |
| Data Master → Biro/Divisi/Penempatan/Peserta/Penugasan/Cakupan/Kalender/Kategori Izin/Parameter (`ResourcePanel` + `config.ts`) | CRUD `/admin/organizations/bureaus`, `/admin/organizations/divisions`, `/admin/placements`, `/admin/intern-profiles`, `/admin/assignments`, `/admin/scopes`, `/admin/calendar`, `/admin/leave-categories`, `/admin/business-parameters` (+ `PATCH /admin/business-parameters/:id`) | `bureaus`, `divisions`, `placements`, `intern_profiles`, `supervisor_assignments`, `admin_scopes`, `calendar_days`, `leave_categories`, `business_parameters` |
| Data Master → Jadwal (`SchedulesPanel`) | `GET /admin/schedules/form-defaults` (default dari parameter+timezone, bukan hardcode), `GET/POST /admin/schedules`, `GET/PATCH /admin/schedules/:id` | `work_schedules`, `work_schedule_days`, `business_parameters` |
| Koreksi absensi (dari `AttendanceDetailPage`) | `POST /admin/attendance/:id/correction` (alasan wajib, before/after diaudit) | `attendance_days`, `attendance_events`, `audit_events` |
| Audit (`AuditPage`) | `GET /admin/audit` (read-only, filter) | `audit_events` |
| Bantuan admin (`HelpAdminPage`) | `GET /help/articles` (termasuk draft, guard admin), `POST /admin/help/articles`, `PATCH /admin/help/articles/:id`, `POST .../publish` / `.../archive` | `help_articles`, `help_categories` |
| Akses (`AccessPage`: RolesPermissionsPanel, FeatureTreePanel, PoliciesPanel, SimulatePanel) | `/admin/access/roles` (+ `GET/PATCH /:id`, `PUT /:id/permissions`), `/admin/access/permissions`, `/admin/access/feature-tree` (+ POST/PATCH), `/admin/access/policies` (+ POST/PATCH), `/admin/access/simulate` (diagnostik, tidak memberi akses) | `roles`, `permissions`, `role_permissions`, `feature_nodes`, `abac_policies`, `user_permission_overrides` |

## 3. Rantai data penting

- **Konvensi error (seluruh API):** kegagalan validasi selalu
  `{ error: { code: 'VALIDATION_ERROR', message: 'Permintaan tidak valid.', fieldErrors: { field: [pesan] } } }`
  dalam Bahasa Indonesia (pesan default zod diterjemahkan; pesan kustom
  lolos apa adanya). Jaring pengaman Prisma: `P2002` → 409 `Data sudah ada.`,
  `P2003` → 409 `Data masih dipakai data lain...`, `P2025` → 404
  `Data tidak ditemukan.` — tidak ada 500 mentah di permukaan API.
- **Check-in/out:** `work_schedules` (resolusi INDIVIDUAL > DIVISION > BUREAU > GLOBAL) + `calendar_days` + `business_parameters` → snapshot immutable `workday_snapshots` → `attendance_days` → `attendance_events` (foto → validasi magic bytes → re-encode JPEG tanpa EXIF → MinIO privat → `file_objects`, satu transaksi PG, compensating delete bila gagal).
- **Status telat** dihitung dari `occurredAtServer` vs snapshot (`startTime` + `lateToleranceMinutes`); toleransi kosong pada jadwal → server memakai `late_tolerance_default_minutes`.
- **Izin:** `leave_requests` state machine (PENDING/APPROVED/REJECTED/CANCELLED/DEPARTED/RETURNED/COMPLETED/NEEDS_REVIEW); pergerakan menulis `leave_events`; early-checkout tanpa izin EARLY_DEPARTURE approved → `attendance_days.dayStatus = NEEDS_REVIEW`; sweep 15 menit menandai DEPARTED basi.
- **Laporan:** baris dibangun dari `workday_snapshots` (bukan dari jadwal live), 13 metrik eksklusif; filter scope yang sama untuk list dan export.
- **Cache akses:** perubahan roles/permissions/policies/feature-tree meng-invalidasi cache effective-access; `GET /access/me/effective` selalu mencerminkan DB.

## 4. Pengaturan yang bisa diubah (tanpa deploy)

| Pengaturan | Sumber kebenaran | Cara mengubah |
|---|---|---|
| Toleransi telat default (usul 15 mnt, `PENDING_KCIC_CONFIRMATION`) | `business_parameters.late_tolerance_default_minutes` | UI Data Master → Parameter (edit JSON `{"value":…}`); berlaku untuk jadwal baru/snapshot baru, tidak mengubah riwayat |
| Hari kerja default (usul Sen–Jum, `PENDING_KCIC_CONFIRMATION`) | `business_parameters.default_workdays` | UI Data Master → Parameter; sumber kebenaran operasional tetap jadwal |
| Jam kerja per hari, toleransi per jadwal | `work_schedules` + `work_schedule_days` | UI Data Master → Jadwal (GLOBAL/DIVISION/BUREAU/INDIVIDUAL, effective dates) |
| Hari libur / pengecualian | `calendar_days` | UI Data Master → Kalender |
| Kategori izin | `leave_categories` | UI Data Master → Kategori Izin (ACTIVE/nonaktif) |
| Struktur organisasi, penempatan, peserta, penugasan pembimbing, scope admin | tabel master terkait | UI Data Master → tab masing-masing |
| Role, permission, feature tree, policy ABAC | tabel akses | UI Akses (Admin IT); role baru = nol permission |
| Artikel bantuan | `help_articles` | UI Bantuan Admin (draft → publish → archive) |

**Kebijakan resmi KCIC belum tersedia** — nilai berstatus `PENDING_KCIC_CONFIRMATION` adalah usulan, bukan keputusan; jangan dikarang. Ganti via UI setelah kebijakan resmi terbit.

## 5. Konfigurasi lewat environment (bukan data bisnis)

Semua config runtime lewat env (divalidasi zod di `apps/api/src/config/env.ts`, fail-fast tanpa membocorkan secret). Daftar lengkap + default: lihat README §Variabel environment dan `.env.example`. Yang utama: `DATABASE_URL`, `SESSION_SECRET`, `SESSION_TTL_HOURS`, `COOKIE_SECURE`, `CORS_ORIGIN`, `APP_URL`, `MINIO_*`, `MAX_UPLOAD_BYTES`, `SIGNED_URL_TTL_SECONDS`, `BUSINESS_TIMEZONE`, `BOOTSTRAP_ADMIN_*`, `SEED_DEV_DATA`, `LOG_LEVEL`, port host (`API_PORT`, `WEB_PORT`, `DB_HOST_PORT`, `MINIO_HOST_PORT`, `MINIO_CONSOLE_HOST_PORT`), dan `API_PROXY_TARGET` (khusus vite dev).

## 6. Konstanta frontend yang SAH (bukan data bisnis)

Sesuai aturan audit ("hardcode tapi konstanta wajar → catat alasannya"):

| Konstanta | Lokasi | Alasan |
|---|---|---|
| Label status/hari/role dalam Bahasa Indonesia, warna chip | `lib/format.ts`, komponen | Presentasi UI, bukan data; sumber nilai tetap API |
| Label menu & ikon navigasi | `components/NavIcon.tsx`, `Layout` | Struktur navigasi statis; visibilitas tetap dari `/access/me/effective` |
| Preset riwayat 7/30 hari/bulan ini | `HistoryPage` | Shortcut UI yang menghitung rentang tanggal relatif terhadap hari ini |
| Debounce 300 ms pencarian | `useUiHelpers.ts` | Parameter interaksi UI |
| Batas ukuran file di sisi klien | form absensi/izin | Cermin `MAX_UPLOAD_BYTES` untuk UX; enforcement tetap di server |
| Timeout fetch 15 s (GET) / 60 s (mutasi), CSRF 10 s | `lib/api.ts` | Deadline transport agar UI tidak menggantung saat backend mati; bukan data bisnis |
| Pagination default 15 / max 100, export ≤20.000 baris, rate-limit login 30/15 mnt | backend | Aturan teknis API (API_CONTRACT §10, §2), didokumentasikan |
| Resolusi gambar minimum, magic bytes, re-encode JPEG | backend files/attendance | Aturan keamanan bukti, bukan konfigurasi bisnis |
| Sweep DEPARTED basi tiap 15 menit | backend leaves | Interval jobs internal |

## 7. Endpoint yang belum dipakai UI (sengaja, terdokumentasi)

| Endpoint | Status |
|---|---|
| `GET /dashboard/participant` | Tersedia di API; Beranda peserta memakai `GET /attendance/today` yang lebih lengkap (serverTime, workday, activeLeave). Bukan dead code backend. |
| `GET /reports/statistics` | Tersedia di API (13 metrik); halaman Laporan saat ini memakai `GET /reports/attendance` yang sudah menyertakan metrik. |
| `POST /auth/reset-password` | Alur recovery = admin menerbitkan token via UI Pengguna (`POST /admin/users/:id/password-reset-token`), lalu token dipakai lewat API ini. Belum ada halaman UI khusus reset; gunakan API/CLI sampai halaman dibuat. |

## 8. Cara memverifikasi sendiri

1. Ubah satu nilai via UI (mis. Parameter toleransi) → cek `docker exec presensi-kcic-db-1 psql -U attendance_app -d attendance_dev -c "SELECT key, value_json FROM business_parameters;"` → nilai sama.
2. Ubah langsung di DB (mis. `UPDATE users SET display_name=…`) → refresh halaman terkait → nilai baru tampil (TanStack Query refetch).
3. Matikan API (`docker compose stop api`) → halaman menampilkan ErrorState "Coba lagi" dalam ≤15 detik, bukan data palsu/loading abadi; nyalakan lagi → retry memulihkan.
4. Bukti lengkap (24 langkah browser + 12 uji keamanan live): `BUILD_LOG.md` Fase A4.