# BUILD LOG

Catat setiap fase pembangunan. Jangan menghapus catatan kegagalan; tambahkan hasil perbaikan.

## 2026-11-22 — Phase 0: Audit repository & environment

- **Status:** PASSED
- **Scope:** Dokumen proyek dibaca lengkap (AGENT/PRD/DECISIONS/ARCHITECTURE/DATA_MODEL/API_CONTRACT/SECURITY/DESIGN/TESTING/IMPLEMENTATION_PLAN). Repo kosong (hanya dokumen + scaffold compose/.env.example).
- **Temuan environment:**
  - Node v24 di host; proyek membutuhkan Node 22 (container Docker memakai `node:22.14.0-alpine3.21`).
  - pnpm 9.15.9 diinstal global via npm (corepack EPERM di Program Files).
  - Ada stack Docker lain milik pengguna (`kcic-*`) yang sudah memakai port 5432/9000/9001 → port host proyek ini dipetakan ulang: DB 5433, MinIO API 9002, MinIO console 9003. Container `kcic-*` TIDAK disentuh.
  - `minio/mc` image tidak dapat di-pull (tag hilang + Docker Hub flaky). **Deviasi terdokumentasi:** `minio-init` diganti service `node:22.14.0-alpine3.21` yang menjalankan `infra/scripts/minio-init.mjs` — mengunduh biner `mc` statis yang di-pin dari `dl.min.io` lalu membuat bucket privat + service user least-privilege.
- **Files changed:** docker-compose.yml (rewrite: name presensi-kcic, healthcheck, api-migrate one-shot, port remap), .env (dibuat, gitignored, secret acak via openssl), infra/scripts/* (setup/gen-host-env/doctor/reset/backup/restore/minio-init.mjs/pipeline.sh).

## 2026-11-22 — Phase 1: Monorepo & fondasi

- **Status:** PASSED (dengan catatan registry)
- **Scope:** pnpm workspace (apps/api, apps/web), tsconfig.base strict NodeNext ESM, Dockerfile api (multi-stage, USER node) & web (vite build → nginx:1.27.3-alpine, proxy /api + SPA fallback).
- **Failures and evidence:** `pnpm install` berulang kali gagal dengan ECONNRESET/TLS disconnect dari registry.npmjs.org (infra/install.log). Migrasi paksa ke Fastify 5 diperlukan karena registry hanya menyediakan @fastify/cookie ≥10 untuk Fastify 5 (ERR_PNPM_NO_MATCHING_VERSION).
- **Fixes:** Seluruh backend dipindah ke Fastify 5 + plugin set v5 (@fastify/cookie 11, cors 11, helmet 13, multipart 9, rate-limit 10, swagger 9), buildApp.ts disesuaikan (validatorCompiler/serializerCompiler zod, jsonSchemaTransform). `.npmrc` network-concurrency=1. Terakhir: pipeline memakai registry mirror `https://registry.npmmirror.com` + `PRISMA_ENGINES_MIRROR`.

## 2026-11-22 — Phase 2: Skema DB, migration, seed

- **Status:** PASSED (selesai; migrate+seed dari volume kosong terverifikasi di entri clean-room di bawah)
- **Scope:** apps/api/prisma/schema.prisma lengkap (seluruh entitas DATA_MODEL: users/roles/permissions/feature-tree/ABAC/sessions/reset tokens, organisasi, placements, intern profiles, assignments, admin scopes, work schedules + days, calendar, workday snapshots, attendance days/events, file objects, leave categories/requests/events, audit events, business parameters, help, idempotency records).
- **Migration:** dibuat via `prisma migrate diff --from-empty` ke `prisma/migrations/0_init/migration.sql` + SQL tambahan: partial unique index satu izin TEMPORARY aktif per peserta per hari kerja, check constraint lat [-90,90]/lng [-180,180], size_bytes > 0.
- **Seed (deterministik, idempotent, data dummy):** katalog 30 permission; 4 role sistem (INTERN/SUPERVISOR/ADMIN_HR/ADMIN_IT) dengan grant tepat; feature tree navigasi; akun dev (bootstrap admin dari env, admin-hr, supervisor1, peserta1-3, password dummy `DevPassword123!` terdokumentasi); 2 biro dummy + divisi + penempatan Tegalluar; 3 profil peserta MG-2026-001..003 + assignment pembimbing; jadwal GLOBAL Sen-Jum 09:00-18:00 toleransi 15 menit — **ditandai PENDING_KCIC_CONFIRMATION** (kebijakan jam resmi KCIC belum tersedia, tidak dikarang); kategori izin (usulan) + parameter bisnis `late_tolerance_default_minutes=15`, `default_workdays=[1..5]` status PENDING_KCIC_CONFIRMATION; help: 1 artikel PUBLISHED + 1 DRAFT (untuk uji visibilitas).

## 2026-11-22 — Phase 3: Auth & access control

- **Status:** IMPLEMENTED (verifikasi via test pipeline)
- **Scope:** Argon2id (@node-rs/argon2), sesi opaque server-side (cookie HttpOnly `sid`, hash sha256 di DB, rotasi saat ganti password, revokasi semua sesi), CSRF double-submit + Origin allowlist, rate-limit login 10/15 menit (dinaikkan menjadi 30/15 menit per IP pada Fase 4 UX — lihat DECISIONS.md D-025) dengan pesan gagal generik + audit AUTH_LOGIN_FAILED, change-password, reset-password token sekali pakai yang diterbitkan admin (audited, ditampilkan sekali).
- **Access control:** RBAC (role→permission, effect ALLOW/DENY) + ABAC (interpreter kondisi JSON: all/any/not; subject roleCodes/adminScopeTypes/accountStatus/isIntern) + ReBAC (supervisor assignment, admin scope). Deny overrides allow. Role baru mulai dengan NOL permission. Guard: tidak bisa memberikan permission yang tidak dimiliki aktor. Default-deny scope filtering (`internScopeWhere` → `{id:'__none__'}` bila tanpa clause). IDOR → 404 tanpa bocoran eksistensi.

## 2026-11-22 — Phase 4: Organisasi, assignment, jadwal

- **Status:** IMPLEMENTED
- **Scope:** CRUD bureaus/divisions/placements/users+roles/intern-profiles/supervisor-assignments/admin-scopes/leave-categories/business-parameters (GLOBAL-scope enforcement untuk master global, scope-covers untuk data peserta, P2002→409, revokasi sesi saat deaktivasi, penolakan key script/sql/code 422). Jadwal: CRUD + validasi hari + conflict detection rentang validitas per scope + kalender HOLIDAY/WORKING_EXCEPTION. Resolusi jadwal: individual > divisi > biro > global, snapshot hari kerja imutabel per peserta per tanggal.

## 2026-11-22 — Phase 5: Files & attendance

- **Status:** IMPLEMENTED
- **Scope:** Upload bukti: sniff magic bytes (JPEG/PNG/WebP), validasi MIME vs deklarasi, decode sharp (failOn truncated), dimensi 60..4096, re-encode JPEG q85 + strip EXIF, object key opaque (UUID, tanpa PII), bucket privat, presigned URL TTL 120s + audit EVIDENCE_ACCESS. Konsistensi MinIO↔PG sesuai ARCHITECTURE §8: staged upload → satu transaksi PG (day+event+file+idempotency+audit) → compensating delete saat gagal, marker FileObject ORPHANED + rekonsiliasi. Absensi: waktu server otoritatif (UTC disimpan, hari bisnis Asia/Jakarta via Intl), Idempotency-Key (replay respons tersimpan; hash beda → 409), urutan CHECK_IN→CHECK_OUT, non-working-day ditolak, isLate = now > start+toleransi (dari snapshot), check-out dini → EARLY_DEPARTURE_APPROVED bila ada izin disetujui, selain itu NEEDS_REVIEW. Koreksi admin: reason ≥5 char, hari bisnis yang sama, recompute isLate/dayStatus, correctionFlag, audit before/after, tanpa duplikasi event. Sweep 15 menit: izin TEMPORARY status DEPARTED yang lewat hari → NEEDS_REVIEW (tidak pernah auto-checkout).

## 2026-11-22 — Phase 6: Leave, koreksi, report, help, audit, dashboard

- **Status:** IMPLEMENTED
- **Scope:** State machine izin: PENDING→APPROVED/REJECTED/CANCELLED; TEMPORARY multi-siklus DEPARTED→RETURNED; EARLY_DEPARTURE EARLY_CHECKOUT→COMPLETED membuat event CHECK_OUT hari itu; reject wajib note ≥3; optimistic lock (version) pada keputusan; satu izin temporary aktif per peserta per hari (pre-check + P2002 + partial unique index). Report: baris digerakkan snapshot hari kerja (peserta terjadwal tampil tanpa event), rentang maks 62 hari, 13 metrik eksklusif (denominator = terjadwal), export CSV/XLSX filter & scope sama, tanpa foto/koordinat, export diaudit, MAX_EXPORT_ROWS 20000. Help: non-manager hanya PUBLISHED (draft → 404 tanpa bocoran). Audit read-only GET /admin/audit (permission admin:audit:view — hanya ADMIN_IT/bootstrap). Dashboard peserta/pembimbing/admin.

## 2026-11-22 — Phase 7-8: Frontend (apps/web)

- **Status:** PASSED (frontend lengkap; 23/23 test web hijau + uji browser — lihat entri clean-room dan Fase 4 di bawah)
- **Scope:** React 18 + Vite 5 + Tailwind + TanStack Query + RHF/Zod. Klien API: envelope unwrap, alur CSRF (GET /auth/csrf → header x-csrf-token), Idempotency-Key untuk submit absensi/gerakan izin. Halaman sesuai DESIGN.md: login, dashboard peserta/pembimbing/admin, absensi kamera (state machine kamera+lokasi, retake, konfirmasi, sukses hanya setelah persist server, copy Bahasa Indonesia dari DESIGN §10), pengajuan/approval/timeline izin, riwayat, monitoring, koreksi, master data, access management (role/feature tree/ABAC/simulate), audit, help center, profil. Navigasi dibangun dari /access/me/effective (hiding menu bukan enforcement; backend tetap otoritatif).

## 2026-11-22 — Phase 9: Test suite

- **Status:** PASSED (suite hijau; jumlah final pasca-Fase 4: API 36 = 27 integrasi + 9 unit, web 23)
- **Scope:** Vitest. Database test terpisah `attendance_test` (dibuat otomatis, migrate deploy + seed idempotent dengan bootstrap admin test).
  - test/unit.test.ts: evaluator permission (default-deny, deny-overrides-allow, ABAC all/any/not, policy INACTIVE diabaikan), konversi waktu bisnis WIB (zonedTimeToUtc 09:00→02:00Z, rollover tanggal, weekday 1..7, addDays lintas bulan).
  - test/api.test.ts (inject end-to-end): 401 tanpa sesi; login gagal → pesan generik; POST tanpa CSRF → 403; effective permissions peserta; check-out sebelum check-in → 409; hari penuh peserta2; check-in peserta1 + replay Idempotency-Key (respons sama) + duplikat key baru → 409; bukti via presigned URL (fetch 200) + peserta lain → 404; IDOR detail absensi → 404; alur izin lengkap (create → reject tanpa note 400 → approve → departure → return; EARLY_DEPARTURE approve → early-checkout → dayStatus EARLY_DEPARTURE_APPROVED); koreksi admin + audit before/after + reason pendek 400; report rows/metrics + export CSV (attachment, tanpa latitude) + peserta 403; role baru zero-permission + simulate allowed=false; ADMIN_HR ditolak kelola role (403); business parameter dengan key `sql` → 422; help published vs draft (404 untuk peserta, 200 untuk admin); deaktivasi user → sesi langsung 401.
- **Commands run:** `bash infra/scripts/pipeline.sh` (install via mirror → prisma generate → migrate diff + constraints → migrate deploy → seed → tsc --noEmit → vitest run). Log: infra/pipeline.log, infra/typecheck.log, infra/test.log.

## 2026-11-22 — MinIO service user: resolusi blocker 410 Gone + perbaikan test

- **Status:** RESOLVED
- **Blocker sebelumnya:** `dl.min.io` mengembalikan `410 Gone` untuk seluruh unduhan `mc` (proyek open-source MinIO/mc/KES diarsipkan, biner tidak lagi disajikan); container `minio-init` juga tanpa DNS (EAI_AGAIN). Akibatnya service user `attendance_local` tidak pernah dibuat → check-in gagal 500 `InvalidAccessKeyId` → 5+ test api gagal beruntun.
- **Resolusi:** biner `mc` linux-amd64 diunduh host-side dari GitHub release resmi `minio/mc` RELEASE.2025-08-13T08-35-41Z ke `infra/bin/mc`, sha256 diverifikasi cocok dengan `mc.linux-amd64.RELEASE.2025-08-13T08-35-41Z.sha256sum` (`01f866e9c5f9...`), bind-mount `./infra/bin:/bin-mc:ro` ke container init. `MC_URL` fallback di `minio-init.mjs` dialihkan ke URL GitHub yang sama.
- **Verifikasi:** `docker compose up --force-recreate minio-init` → exit 0; `mc admin user list local` → `enabled attendance_local app-service-policy`; bucket `attendance-evidence` dan `help-media` ada dan privat.
- **Perbaikan test (api.test.ts):** (1) assertion login gagal → `toContain('username atau password salah')` (pesan generik gabungan, bukan leak per-field); (2) test CSRF pindah ke `POST /auth/logout` (route tanpa body schema; sebelumnya `POST /leaves` kena validasi 400 sebelum preHandler); (3) multipart check-in peserta1 dibangun SEKALI (boundary content-type wajib sama dengan body untuk replay); (4) `p1CheckInEventId = data.eventId` sesuai bentuk SubmitResult.
- **Perbaikan test (setup.ts):** `attendance_test` di-DROP+CREATE ulang setiap run (test memutasi state: deaktivasi peserta2, idempotency key tetap, koreksi) — sebelumnya run kedua gagal login peserta2. Skip via `KEEP_TEST_DB=1`.
- **Perbaikan backend:** `reports/service.ts` `businessWeekday(parseDateOnly(dateStr))` (sebelumnya `parseDateOnly(dateStr+'T00:00:00Z')` → Invalid Date → 500 RangeError di report).

## 2026-11-22 — Backend test suite HIJAU + perbaikan build image Docker

- **Status:** VERIFIED (backend; stack penuh diverifikasi pada entri clean-room berikutnya)
- **Hasil test backend:** `pnpm exec vitest run` → **32/32 pass (2 file)**; `tsc --noEmit` → exit 0. Frontend: **23/23 pass**, tsc bersih. Perbaikan assertion terakhir: respons movement izin memakai field `leaveStatus` (bukan `status`); audit koreksi difilter `objectType=attendance_event&action=ATTENDANCE_CORRECTION` sesuai implementasi.
- **Perbaikan build image (ditemukan saat clean build):**
  1. `.dockerignore`: pola `node_modules`/`dist`/`.env` hanya match di root context — `apps/*/node_modules` dari host (symlink Windows rusak) ikut ter-COPY dan menimpa hasil `pnpm install` dalam image. Diganti glob rekursif `**/node_modules` dll. + `infra/bin` (biner mc 30MB tidak perlu masuk context).
  2. `apps/api/Dockerfile`: `ENV NODE_ENV=production` SEBELUM `pnpm install` membuat pnpm melewati (skip) devDependencies → `prisma`/`tsc` tidak ditemukan (sebelumnya tertutup bug #1). Dipindah ke setelah tahap build.
  3. `apps/web/Dockerfile`: tag `nginx:1.27.3-alpine` gagal di-pull (Docker Hub EOF berulang) → pakai `nginx:1.27-alpine` yang sudah tersedia lokal.
- **MinIO service user:** `attendance_local` terverifikasi `enabled` dengan `app-service-policy`; bucket `attendance-evidence` + `help-media` privat (lihat entri sebelumnya).

## 2026-11-22 — Clean-room verification + perbaikan guard frontend

- **Status:** VERIFIED
- **Clean-room:** `docker compose down -v && docker compose up -d --build` dari volume kosong → api-migrate exit 0 (migrate deploy + seed dalam container), api healthy, `/health/ready` = {db:true,minio:true}, web 200, login admin-hr via nginx 200. Port host final: API 3002, Web 5174 (3000/5173 dipakai stack `kcic-*` milik user yang tidak boleh disentuh; 3001 dipakai kcic-grafana).
- **Bug frontend ditemukan via uji browser (diperbaiki):** (1) `fetchMe` di `lib/auth.tsx` menyimpan wrapper `{user}` dari envelope `/auth/me` → setelah hard reload permissions kosong → guard menolak /absensi padahal user berhak; (2) guard route (App.tsx) & fallbackNav (Layout.tsx) memakai kode permission yang tidak ada di katalog (`admin:manage`, `access:manage`, `audit:view`, `help:manage`, `master:manage`) → diganti kode nyata (`admin:users:manage`, `access:roles:manage`, `admin:audit:view`, `admin:help:manage`, daftar `admin:*:manage` untuk /master, daftar `access:*` untuk /access). Setelah fix: 23/23 test web hijau, tsc bersih, browser: login → dashboard → /absensi (hard reload) OK.
- **Catatan:** uji browser mencakup alur peserta (login, dashboard, absensi, nav). Alur admin/supervisor diverifikasi lewat 33 test API (inject) — E2E browser per-role tambahan direkomendasikan saat pilot.
- **Perbaikan lanjutan (uji browser admin-hr di /master):** kolom Role pada tabel Pengguna selalu "-" dan dropdown "Atur Role" kosong karena (a) respons GET /admin/users tidak menyertakan role (hanya roleAssignments internal), dan (b) katalog role diambil dari GET /admin/access/roles yang IT-only (403 untuk ADMIN_HR). Fix: GET /admin/users kini memetakan roleAssignments → roles [{id,code,name}]; endpoint baru GET /admin/roles (read-only katalog role ACTIVE, guard admin:users:manage — governance role tetap IT-only di /admin/access/*); UsersPanel memakai /admin/roles. Test baru di api.test.ts: katalog role untuk ADMIN_HR + roles ter-map pada list pengguna.

## 2026-11-22 — Fase 4 — Upgrade UX & navigasi (commit f8a83a8)

- **Status:** VERIFIED
- **Scope:** Seluruh temuan audit F-01..F-17 (docs/AUDIT.md §10) + 3 improvement kecil:
  - **Navigasi/layout:** Layout ditulis ulang (header sticky full-width, flex hanya sidebar+main — fix desktop rusak F-02); bottom nav mobile 4 item primer + tombol "Menu" membuka sheet berisi semua item role (F-05); label menu pendek satu sumber di seed FEATURE_NODES (upsert idempoten) + fallback Layout: Beranda, Absen, Izin, Izin Peserta, Riwayat, Monitoring, Approval, Laporan, Data Master, Akses, Audit, Bantuan, Profil (F-08); ikon SVG inline menggantikan emoji (F-14); brand/nama akun truncate satu baris di 360px (F-15); landing ADMIN_IT diarahkan ke AdminDashboardPage (F-06).
  - **Dashboard & absensi:** AdminDashboard membaca `counts.*`, SupervisorDashboard memetakan `todayStats.*` + backend additive `pendingLeaves`/`todayStatus[]` (F-03/F-04); fallback `NOT_SCHEDULED` + banner hari non-kerja dengan tombol absen disabled berpenjelasan (F-07); layar explain digabung ke capture, alur mulai otomatis di hari kerja (F-17); envelope error API terbentuk benar (setErrorHandler sebelum registrasi plugin, F-01) sehingga alasan penolakan terbaca di UI.
  - **Izin & umpan balik:** node nav "Izin Peserta" (`leave:view:scoped`) + LeavesPage read-only `scope=scoped` untuk pembimbing (F-11); komponen SuccessNotice di UsersPanel/ResourcePanel (F-09); tap target 44px `min-h-touch` (F-10); petunjuk geser tabel di layar sempit (F-16).
  - **Improvement:** I-1 chip preset riwayat (7 hari terakhir / 30 hari terakhir / Bulan ini); I-2 banner pengingat absen pulang di Beranda peserta; I-3 `GET /attendance/export` CSV riwayat pribadi (tanpa foto/koordinat, diaudit `ATTENDANCE_EXPORT_SELF`, hanya akun berprofil peserta) + tombol "Unduh CSV" di Riwayat + 2 test API baru.
  - **Bug tambahan diperbaiki:** opsi status akun `DISABLED` yang tidak ada di enum diganti Aktif/Nonaktif/Ditangguhkan; validasi zod ResourcePanel kini throw sehingga dialog tidak tertutup saat isian invalid.
- **Verifikasi:** typecheck API & web hijau; lint kedua app hijau (`.eslintrc.cjs` baru, eslint 8 + @typescript-eslint 8 + react-hooks, `--max-warnings 0` — F-12); **test API 36/36** (27 integrasi + 9 unit, DB `attendance_test` dibuat ulang per run); **test web 23/23**; build web hijau; Docker rebuild + reseed; uji browser Playwright (skrip ad-hoc di luar repo) pada viewport 360/390/1280 untuk peserta1, supervisor1, admin-hr, dan akun dummy IT-only.
- **Known limitations (jujur, bukan dihapus):** Swagger UI tidak ada (OpenAPI hanya JSON di `/api/v1/docs/json`); suite E2E belum diotomasi (tidak ada `test:e2e`/Playwright di repo — verifikasi browser = skrip ad-hoc); compose memakai satu user Postgres initdb untuk runtime+migrasi (deviasi least-privilege, dicatat di SECURITY.md §8). Tanpa perubahan skema DB; perubahan backend hanya additive.

## 2026-11-22 — Fase 5 — Sinkronisasi dokumentasi

- **Status:** DONE
- **Scope:** seluruh dokumen root disinkronkan dengan implementasi nyata (hasil review diff per file): README (URL OpenAPI JSON-only, perintah lint/test web, troubleshooting mc, seksi Navigasi & UX), AGENT.md/PROMPT_AGENT.md/IMPLEMENTATION_PLAN.md (BUILD_LOG di root, bukan docs/), ARCHITECTURE.md (struktur repo & modul aktual, service compose, port host), API_CONTRACT.md (endpoint nyata: /auth/csrf, /attendance/export, /admin/access/*, katalog role read-only, reset token admin; forgot-password TIDAK ada), DATA_MODEL.md (feature_nodes/abac_policies lengkap; schedule_assignments TIDAK ada — scope inline di work_schedules), DESIGN.md §2 (menu per role hasil Fase 4), SECURITY.md §3+§8 (rate limit 30/15 menit; deviasi satu user Postgres), TESTING.md/CODE_QUALITY.md (perintah yang benar-benar ada; E2E/formatter/audit/secret-scan/architecture-tests ditandai BELUM DIOTOMASI), DECISIONS.md (D-025..D-029), REQUIREMENTS_TRACEABILITY.md (sitasi dipetakan ke bagian PRD nyata, bukan ID fiktif), RUNBOOK.md (URL/port aktual, prasyarat infra/bin/mc), .env.example (port host remap + komentar), infra/scripts/setup.sh (echo URL dibaca dari .env).
- **Dokumen baru:** `CHANGELOG.md` (riwayat perubahan per commit) dan `docs/USER_GUIDE.md` (panduan pengguna Bahasa Indonesia sederhana: login, absen masuk/pulang, hari libur, izin + catat pergerakan, riwayat + CSV, bantuan/profil, troubleshooting, pembimbing, admin).
- **Verifikasi:** label/istilah di USER_GUIDE dicocokkan dengan kode (EVENT_TYPE_LABELS, pesan server, nama tombol); tidak ada klaim fitur yang tidak ada.
- **Catatan:** jumlah test pada entri historis dibiarkan apa adanya (33/36/23); jumlah terkini pasca-Fase 6 = API 38, web 24 (lihat entri Fase 6).

## 2026-11-22 — Fase 6 — Verifikasi akhir & perbaikan alur inti (commit 18a20a6, docs 7cf6193 + entri ini)

- **Status:** VERIFIED
- **Temuan browser (docs/AUDIT.md §11):** F-19 CSRF cache basi pasca-login (403 pada mutasi pertama), F-20 scope riwayat pribadi salah kolom (0 baris), F-21 form izin peserta memanggil endpoint admin (403). Ketiganya diperbaiki + 4 test regresi baru; keputusan D-028/D-029; kontrak API_CONTRACT §5 diperbarui.
- **Perintah & hasil (exit 0):** `pnpm --filter api test` → 38/38 (29 integrasi + 9 unit); `pnpm --filter web test` → 24/24; `pnpm --filter api lint` & `pnpm --filter web lint` (`--max-warnings 0`); `pnpm --filter api build` (prisma generate + tsc); `pnpm --filter web build` (tsc + vite). Docker `up -d --build api web` → api healthy, web started.
- **Uji browser ad-hoc (skrip di luar repo, Playwright Python):** golden path peserta 390×844 lengkap (check-in → check-out → riwayat → CSV → izin ajukan → PENDING → batal → CANCELLED; aturan satu izin TEMPORARY aktif/hari terbukti); desktop 1280×800 peserta/pembimbing/admin-hr (monitoring→detail, laporan, master, audit, approval); state "Akses ditolak" benar untuk pembimbing di /approval. Screenshot & JSON hasil di folder temp ux-audit (tidak masuk repo).
- **Cleanup artefak uji (dummy):** jadwal uji peserta3 → INACTIVE (PATCH admin ber-audit); akun `it-uji` → INACTIVE (PATCH admin ber-audit); 8 file_objects + 8 objek MinIO yatim milik run E2E dihapus; 1 snapshot basi dihapus lebih awal saat 0 absensi. Sisa contoh dummy: riwayat hari ini peserta3 (NEEDS_REVIEW) + 2 izin CANCELLED + 2 objek bukti terreferensi.
- **Operasional:** `infra/scripts/doctor.sh` sebelumnya probing port hardcoded (3000/5173/5432/9000/9001) sehingga FAIL palsu dan malah menganggap stack lain "OK". Kini membaca port host dari `.env` dengan default yang sama seperti docker-compose.yml (3000/5173/5433/9002/9003). Hasil akhir: **Doctor: PASS** (port 3002/5174/5433/9002/9003 bound, 4 container running, api live+ready, web reachable, migrasi ada).
- **Known limitations:** E2E dalam repo belum diotomasi (BELUM DIOTOMASI, lihat TESTING.md); bucket MinIO bersama dev/test → objek yatim run test (privat, lokal; isolasi direncanakan); Swagger UI tidak ada; satu user Postgres untuk runtime+migrasi (SECURITY.md §8); uji perangkat kamera/GPS nyata menunggu pilot.
- **Next task:** pilot perangkat nyata + keputusan kebijakan KCIC yang PENDING; otomasi suite E2E dalam repo; isolasi bucket MinIO test; pemisahan kredensial DB runtime/migrasi.

## 2026-11-22 — Fase A1–A2 — Audit integritas data (scan hardcode + peta koneksi)

- **Status:** DONE (audit; perbaikan di Fase A3).
- **A1 scan 7 kategori** (frontend+backend): 13 temuan terklasifikasi; 2 **P1 backend**: (1) toleransi telat default diliteral `15` mengabaikan `business_parameters.late_tolerance_default_minutes` yang di-seed; (2) compose menjalankan seed dummy tanpa syarat. Sisanya: default form jadwal hardcode (08:00/17:00/15), field `value` palsu di tab Parameter, enum scope `PLACEMENT` tidak dikenal backend, filter Monitoring tidak terkirim server-side, fallback angka palsu (`-` vs karangan), scope LeavesPage `scoped` → 400 untuk pembimbing/admin, dan konstanta sah (label UI, debounce, preset riwayat) yang dicatat alasannya, bukan dipindah.
- **A2 audit koneksi**: peta halaman→endpoint→tabel DB semua role (hasil akhir didokumentasikan di `docs/DATA_FLOW.md`); kontrak request/response vs schema zod server; auth/CSRF/Origin; pagination & scope; integritas absensi (waktu server otoritatif, snapshot immutable, idempotency, bukti MinIO privat).

## 2026-11-22 — Fase A3 — Perbaikan integritas data (commit eaedfbc)

- **Status:** VERIFIED.
- **Backend:** `common/params.ts` membaca toleransi default dari business_parameters; `GET /admin/schedules/form-defaults` (default_workdays + toleransi, bukan hardcode); seed opt-in `SEED_DEV_DATA=true` (tolak production); `BUSINESS_TIMEZONE` benar-benar dipakai `common/time.ts`; Origin dev localhost:5173 hanya saat dev/test; `clientSubmittedAt` ISO invalid → 400; akurasi lokasi pergerakan izin divalidasi sama seperti absensi; dashboard admin menghitung "terjadwal" via resolveWorkday bila tanpa snapshot; route baru `GET /admin/access/roles/:id` + `PATCH /admin/business-parameters/:id` (audit, tolak key eksekusi); `GET /attendance` filter bureauId/divisionId/search server-side.
- **Frontend:** SchedulesPanel default dari API + enum INDIVIDUAL; tab Parameter render/edit valueJson via PATCH per-id; LeavesPage scope `all` untuk pembimbing/admin; fallback palsu → state jujur (`-`/badge netral); vite `API_PROXY_TARGET`.
- **Verifikasi:** 8 test baru → **API 46/46, web 24/24**; build + lint kedua app hijau. Tanpa perubahan skema DB (semua additive; rollback = revert commit, parameter kembali dibaca literal — tidak disarankan).

## 2026-11-22 — Fase A4 — Pembuktian E2E + perbaikan celah yang ditemukan (commit 974f9b0)

- **Status:** VERIFIED (bukti, bukan klaim).
- **Pembuktian browser 24/24** (Playwright Python, skrip ad-hoc di luar repo; mobile 390 + desktop; hasil JSON + screenshot di folder temp ux-audit): buat user `peserta-uji-*` via UI Pengguna (role INTERN, wajib ganti password dipaksa di mobile) → profil via tab Peserta → jadwal INDIVIDUAL toleransi KOSONG → check-in foto+GPS → `workday_snapshots.late_tolerance_minutes` = nilai parameter (20) → riwayat ≥1 baris → izin TEMPORARY PENDING → admin-hr tolak ber-catatan via /approval → DB REJECTED + decisionNote → catatan tampil di detail izin peserta. Parameter diubah via UI 15→20, lalu langsung di DB →30 dan tampil di UI, dikembalikan 15 via UI. `display_name` diubah langsung di DB → tampil di Monitoring → dikembalikan. `docker compose stop api` → /riwayat menampilkan ErrorState "Coba lagi" ≤25 dtk, 0 baris (bukan data palsu) → start → retry memulihkan.
- **Pembuktian keamanan live 12/12** (HTTP langsung ke API): peserta → /admin/users & /admin/audit 403; sid palsu 401; POST /leaves body valid tanpa x-csrf-token 403; password salah 401 generik; check-out dengan `clientSubmittedAt=2020-01-01` → 201 dengan occurredAtServer = hari ini (waktu klien diabaikan); double check-in 409; accuracyMeters=0 → 400; admin PATCH parameter dengan Origin `http://evil.example` → 403 "Origin tidak diizinkan." dan parameter tidak berubah.
- **Celah yang ditemukan SAAT proof dan diperbaiki (9 file, +259/−64):** (1) 8 form Master mengirim field di luar kontrak API (isActive vs status, date vs calendarDate, fullName tak ada, FK wajib hilang, placement divisionId/validFrom tak dikenal) → create selalu 400; `master/config.ts` ditulis ulang selaras zod server + `config.test.ts` 14 test. (2) Toggle ResourcePanel kirim boolean isActive → kini `{status}`. (3) Catatan keputusan izin tak tampil (web baca `approvalNote`, API kirim `decisionNote`) → types + LeaveDetailPage. (4) Backend mati = loading abadi: nginx cache IP upstream (~60 dtk connect hang) + fetch tanpa deadline → `proxy_connect_timeout 5s`, deadline fetch 15s GET/60s mutasi/10s CSRF, `bootError` + ErrorState di RequireAuth (401 tetap redirect login).
- **Verifikasi akhir:** API lint + **46/46**, web lint + **38/38**, build web + Docker rebuild healthy, **doctor PASS**, scan ulang hardcode bersih (sisa hanya konstanta sah terdokumentasi di DATA_FLOW §6).
- **Cleanup (tanpa hapus data):** 5 jadwal uji "Uji Dinamis" → INACTIVE via PATCH admin ber-audit (6 baris audit ADMIN_SCHEDULE_UPDATE); parameter toleransi kembali 15 `PENDING_KCIC_CONFIRMATION`. Artefak dummy dibiarkan: 4 akun peserta-uji-* + profil + absensi hari ini, 1 izin REJECTED, 1 early-checkout NEEDS_REVIEW (dari uji keamanan), contoh NEEDS_REVIEW peserta3 sebelumnya.

## 2026-11-22 — Fase A5 — Dokumentasi integritas data (entri ini)

- **Status:** DONE.
- **Baru:** `docs/DATA_FLOW.md` (peta halaman→API→DB per role, rantai data, pengaturan yang bisa diubah tanpa deploy, konstanta sah + alasan, endpoint belum dipakai UI, cara verifikasi mandiri).
- **Sinkronisasi:** README (tabel env lengkap + migrate/seed manual vs api-migrate + tautan DATA_FLOW); `.env.example` (SESSION_TTL_HOURS, MAX_UPLOAD_BYTES, SIGNED_URL_TTL_SECONDS, BUSINESS_TIMEZONE, API_PROXY_TARGET sebagai opsi berkomentar); API_CONTRACT (§4 filter + clientSubmittedAt 400; §6 form-defaults/schedules/:id/PATCH params/:id; §9 GET roles/:id); docker-compose `TZ: ${BUSINESS_TIMEZONE:-Asia/Jakarta}`; CHANGELOG entri A3/A4/A5; DECISIONS D-030/D-031.
- **Verifikasi:** klaim dokumen dicocokkan dengan kode (grep endpoint web, schema.prisma @@map, env.ts, seed.ts, compose env_file); tanpa perubahan perilaku aplikasi kecuali TZ compose yang default-nya identik.

## Keputusan pending (TIDAK dikarang)


- Jam kerja resmi, toleransi keterlambatan, dan hari kerja default KCIC → seed memakai usulan (09:00-18:00, 15 menit, Sen-Jum) dengan status `PENDING_KCIC_CONFIRMATION`.
- Kategori izin resmi KCIC → seed memakai usulan (KAMPUS/KESEHATAN/KELUARGA/DINAS/LAINNYA).
- Versi minimum browser perangkat mobile → menunggu uji pilot perangkat nyata.
- Deployment production → di luar scope sesuai instruksi.
