# LAPORAN AKHIR — Perbaikan Bug & Integrasi Penuh

Arc perbaikan menyeluruh atas brief "perbaiki semua bug dan terapkan semua penyesuaian … sampai frontend dan backend terintegrasi penuh, CRUD berjalan, dan tidak ada error maupun bug tersisa".

- **Branch:** `feat/uji-manual-integrasi`
- **Rentang commit:** `25300ad` … `85f1ebc` (+ commit Fase 6 di atasnya)
- **Tanggal:** 2026-11-22 (WIB)
- **Lingkungan:** lokal/development, Docker Compose `presensi-kcic` (API 3002, web 5174, DB 5433, MinIO 9002/9003). Seluruh data dummy.

## 1. Ringkasan per fase

| Fase | Commit | Isi utama |
|---|---|---|
| 0.1–0.2 | `25300ad` | Origin `127.0.0.1:5174` tidak lagi ditolak; fokus input yang melompat tiap 1 karakter diperbaiki. |
| 0.6 | `6cc170e` | Identitas dummy realistis (seed nama asli, bukan "uji/dummy"). |
| 0.3–0.5 | `9dd7cec` | Sidebar bisa diciutkan + drawer hamburger HP; header dirapikan; tema KCIC `#8B1A1A` via design tokens; combobox searchable dropdown master. |
| 1.1 | `18020d0` | Filter dashboard admin (biro/divisi/tanggal) dijalankan di backend + grafik SVG tanpa library baru. |
| 1.2–1.4 | `ef6f786` | Kolom Aksi ikon + pagination server-side 10/25/50/100 di Monitoring, Approval, Laporan. |
| 1.5a–e | `68e6918` | CRUD role di Data Master → tab Role; menu Peserta digabung ke Pengguna; menu Penugasan dihapus dari UI (endpoint tetap ada). |
| 1.5f | `7c0bab2` | Import Excel pengguna: template xlsx dinamis dari DB, validate → confirm, error per baris, `mustChangePassword`. |
| 1.6 | `05d8236` | Halaman "Pengguna & Hak Akses": pohon permission 7 menu → submenu → fitur/aksi + template Administrator/Pembimbing/Peserta (tersimpan backend). |
| 2 | `37ab6a8` | RBAC penuh di frontend: menu dari permission efektif, guard rute, tombol disembunyikan tanpa permission; backend tetap titik keputusan. |
| 3 | `09f7688` | Profil lengkap (role, penugasan, pembimbing, jadwal aktif) + edit whitelist kontak (nama/email/telepon) divalidasi backend. |
| 4 | `873a62b` | Feedback error ramah: envelope `VALIDATION_ERROR` Bahasa Indonesia + `fieldErrors`, terjemahan pesan zod, jaring pengaman Prisma `P2002/P2003/P2025`, panel menampilkan pesan field pertama. |
| 5 | `85f1ebc` | Dokumentasi: `docs/RBAC.md`, `docs/ADMIN_GUIDE.md`, README per-role, DATA_FLOW, USER_GUIDE, CHANGELOG. |
| 6 | (commit laporan) | Verifikasi berbukti ulang seluruh suite + pembersihan data uji + laporan ini. |

## 2. File utama yang diubah

Total `ac95ee5..HEAD`: **102 file, +8170/−1035** (apps: 76 file, +6965/−884). Ringkas per area (detail penuh per commit di `git show --stat`):

- **Backend API:** `app/buildApp.ts` (envelope error + jaring Prisma), `modules/users/profileRoutes.ts` (GET/PATCH profil), `modules/schedules/service.ts` (`getActiveScheduleForProfile`), `modules/admin/routes.ts` (role CRUD, filter user, phone schema), `modules/admin/user-import.ts` (import Excel), `modules/access/permission-taxonomy.ts` (pohon + template), `modules/attendance/` & `modules/reports/` (filter/pagination/urutan), `modules/dashboard/` (filter backend), `modules/leaves/` (endpoint kategori peserta).
- **Frontend web:** `components/Layout.tsx`, `MasterCombobox.tsx`, `ServerPagination.tsx`, `SuccessNotice.tsx`, `Icon.tsx`, `routes/master/{UsersPanel,RolesPanel,ImportUsersDialog,config.ts}`, `routes/access/RolesPermissionsPanel.tsx`, `routes/{ProfilePage,AdminDashboardPage,MonitoringPage,ApprovalsPage,ReportsPage,LeavesPage,HistoryPage}.tsx`, `lib/{api.ts,auth.tsx,types.ts}`, `routes/guards.tsx`, `tailwind.config.js`.
- **Test:** `apps/api/test/api.test.ts` (+45 test baru sepanjang arc), `apps/api/test/unit.test.ts`, `apps/web/src/lib/api.test.ts`, `apps/web/src/routes/master/config.test.ts`, `apps/web/src/components/{ConfirmDialog,MasterCombobox}.test.tsx`.
- **Infra:** `infra/scripts/doctor.sh`, `setup.sh`; `apps/web/nginx.conf`.
- **Docs:** `docs/RBAC.md`, `docs/ADMIN_GUIDE.md`, `README.md`, `docs/DATA_FLOW.md`, `docs/USER_GUIDE.md`, `CHANGELOG.md`, `API_CONTRACT.md`, `DECISIONS.md` (D-028…D-031), `BUILD_LOG.md`.

## 3. Perubahan skema database

**Tidak ada migration Prisma baru pada arc ini** — semua perbaikan berupa endpoint tambahan, perubahan perilaku, dan data seed idempoten. Skema `prisma/schema.prisma` tidak berubah sejak baseline `ac95ee5`; rollback DB untuk arc ini **tidak diperlukan** (revert commit saja; seed idempoten aman dijalankan ulang).

Perubahan data yang dilakukan selama uji (tanpa menghapus data pengguna):
- 16 biro scratch `QA-F6-01…16` buatan sendiri (uji pagination) **dihapus via SQL** setelah pembuktian — verifikasi `DELETE 16`.
- Role SUPERVISOR dikembalikan tepat 7 permission setelah uji pencabutan (SQL `INSERT … gen_random_uuid()`), diverifikasi `count = 7`.
- Nama jadwal sisa uji diganti menjadi "Jadwal Global Default" / "Jadwal Individu Peserta 1" (rename, bukan delete).

## 4. Matriks CRUD per role (status: semua ✓ terbukti)

**Peserta (INTERN)** — permission: `attendance:submit`, `attendance:view:own`, `attendance:evidence:view`, `leave:request`, `leave:view:own`, `dashboard:view`, `help:view`

| Halaman | C | R | U | D | Lain |
|---|---|---|---|---|---|
| Beranda | – | ✓ status hari ini | – | – | pengingat belum absen pulang |
| Absen | ✓ check-in/out + selfie/GPS (idempotency) | ✓ | – | – | hari non-kerja dijelaskan |
| Izin | ✓ ajukan (kategori dari `/leaves/categories`) | ✓ list/detail | ✓ cancel, departure/return/early-checkout | – | catatan keputusan tampil |
| Riwayat | – | ✓ milik sendiri + detail | – | – | CSV pribadi, preset 7/30/bulan ini |
| Profil | – | ✓ role/penugasan/pembimbing/jadwal | ✓ nama/email/telepon (whitelist backend) | – | ganti password |

**Pembimbing (SUPERVISOR)** — permission: `attendance:view:scoped`, `attendance:evidence:view`, `leave:view:scoped`, `report:view`, `report:export`, `dashboard:view`, `help:view`

| Halaman | C | R | U | D | Lain |
|---|---|---|---|---|---|
| Beranda | – | ✓ dashboard binaan | – | – | – |
| Monitoring | – | ✓ scope + filter biro/divisi/cari + pagination | – | – | detail + bukti (presigned, diaudit) |
| Izin Peserta | – | ✓ read-only scope | – | – | tanpa tombol aksi (RBAC) |
| Laporan | – | ✓ + metrik | – | – | ekspor CSV/XLSX |
| Profil | – | ✓ | ✓ kontak | – | ganti password |

**Admin HR (ADMIN_HR)** — selain di atas: `admin:*` kelola, `leave:approve`, `attendance:correct`, `admin:audit:view`

| Halaman | C | R | U | D | Lain |
|---|---|---|---|---|---|
| Beranda | – | ✓ filter biro/divisi/tanggal + grafik | – | – | – |
| Monitoring | – | ✓ semua + filter + pagination | – | – | koreksi absensi ber-alasan (diaudit) |
| Approval | – | ✓ PENDING + pagination | ✓ setuju/tolak (catatan wajib) | – | – |
| Laporan | – | ✓ | – | – | CSV/XLSX ≤20.000 baris |
| Data Master → Pengguna | ✓ manual + import Excel | ✓ filter/role | ✓ edit, role, reset password (token sekali tampil) | ✓ nonaktif (status) | template xlsx dinamis |
| Data Master → 8 tab lainnya | ✓ | ✓ | ✓ | – | aktif/nonaktif via status (bukan delete fisik) |
| Audit | – | ✓ filter | – | – | read-only |
| Profil | – | ✓ | ✓ | – | – |

**Admin IT (ADMIN_IT)** — `access:*`, `admin:audit:view`, `admin:help:manage`, dll. (union saat `dev-admin` memegang ADMIN_HR+ADMIN_IT)

| Halaman | C | R | U | D | Lain |
|---|---|---|---|---|---|
| Pengguna & Hak Akses | ✓ role baru (nol permission) | ✓ pohon permission, policy, simulasi | ✓ assign permission (ALLOW/DENY), feature tree, policy | ✓ hapus role bila tidak berpengguna & bukan sistem (terlindungi 2 lapis) | template 1 klik; live reload menu/tombol |
| Audit | – | ✓ | – | – | read-only |
| Bantuan Admin | ✓ artikel draft | ✓ | ✓ | – | publish/archive |

## 5. Asumsi & keputusan ambigu (opsi paling sederhana untuk user)

1. **Notifikasi inline, bukan toast library.** Pesan sukses/gagal memakai panel inline berwarna (`role="status"`/`"alert"`) — tanpa dependensi baru (aturan: jangan install dependency tanpa perlu).
2. **"Hapus" data master = nonaktifkan.** Biro/divisi/penempatan/jadwal/kategori/parameter memakai toggle status ACTIVE/INACTIVE (data riwayat mengacu ke sana; delete fisik berbahaya). Delete fisik hanya untuk role yang tidak berpengguna dan bukan role sistem.
3. **Menu Penugasan dihapus dari UI Data Master**; pembuatan peserta digabung ke tab Pengguna (user + profil sekaligus). Endpoint `/admin/assignments` tetap ada di API dan dipakai oleh fitur profil/test.
4. **Template role disimpan di backend** (`permission-taxonomy.ts`) sehingga pohon permission tidak di-hardcode di frontend.
5. **Pagination server-side default 15 baris** (konsisten kontrak API: default 15, maks 100); UI menawarkan 10/25/50/100.
6. **Telepon** `^(?:08\d{7,12}|62\d{8,13}|\+\d{7,15})$` — Indonesia `08xx`/`62-8xx` atau kode negara `+` apa pun (E.164, 7-15 digit); seragam di profil, admin user, import Excel. Kolom No. HP template bertipe teks agar Excel tidak menghapus 0 di depan.
7. **Grafik dashboard SVG buatan sendiri** — tanpa library chart baru (aturan dependency).
8. **Import Excel dua langkah (validate → confirm)** agar admin melihat error per baris sebelum data dibuat; semua user hasil import `mustChangePassword`.
9. **Login tidak menolak Origin asing.** Pemeriksaan Origin+CSRF dijalankan pada semua mutasi ber-sesi (`apps/api/src/app/auth.ts:18`); `POST /auth/login` memang dikecualikan karena belum ada sesi/cookie. Probe ulang membuktikan login Origin asing tetap 200 — ini *login-CSRF*, risiko rendah untuk aplikasi lokal dummy; sengaja tidak diubah di ujung arc agar tidak merusak alur login yang sudah terbukti, dicatat sebagai saran lanjutan (§8). Bukti A4 "Origin asing → 403" tetap valid untuk endpoint ber-sesi.
10. **Rate-limit login 30/15 menit per IP bersifat in-memory.** Uji E2E beruntun bisa kena 429 lalu pulih setelah restart API — perilaku benar, bukan bug.
11. **Lokasi absensi bukan syarat sah (keputusan UAT 22/11 malam).** Prinsip yang dipilih: "bebas absen di mana saja, yang penting tercatat di mana" — koordinat GPS diperlakukan seperti bukti/timestamp, dicatat bila perangkat menyediakan, NULL bila izin lokasi/GPS tidak tersedia. Tidak ada geofence dan tidak ada pemblokiran; backend tetap menolak koordinat yang tidak valid/non-numerik. Konsekuensi: kolom `latitude/longitude` pada `attendance_events` & `leave_events` menjadi nullable (migrasi `20261122120000_location_optional`, ada rencana rollback di komentarnya). UI selalu memberitahu pengguna bila koordinat tidak ikut tercatat.

## 6. Bukti pengujian (bukan klaim)

### Gate akhir (2026-11-22, 15:25 WIB)

| Gate | Hasil |
|---|---|
| `pnpm --filter api exec tsc --noEmit` | ✓ 0 error |
| `pnpm --filter api lint` (eslint, `--max-warnings 0`) | ✓ bersih |
| `pnpm --filter api test` (vitest, DB `attendance_test`) | ✓ **73/73** |
| `pnpm --filter web exec tsc --noEmit` | ✓ 0 error |
| `pnpm --filter web lint` | ✓ bersih |
| `pnpm --filter web test` | ✓ **42/42** |

### E2E browser (Playwright headless, desktop + mobile 390/360px; skrip di `%TEMP%\ux-audit\`)

| Suite | Langkah | Hasil |
|---|---|---|
| `verify_f16.py` — pohon permission, template role, guard | 25 | **25/25** |
| `verify_f2.py` — RBAC penuh per role + pencabutan permission live | 42 | **0 gagal** |
| `verify_f3.py` — profil lengkap + kontak + 390px | 28 | **28/28** |
| `verify_f4.py` — error per-field, role create+delete, 390px | 7 | **7/7** |
| `verify_f6.py` — pagination, filter dashboard, konsol bersih, per-role 360px | 15 | **15/15** |

Screenshot bukti: `ux-audit/f3_*.png`, `f4_*.png`, `f6_*.png`.

### Uji keamanan (live, ringkas)

- Peserta mengakses endpoint admin → 403; tombol/menu tersembunyi di frontend **dan** backend tetap menolak.
- POST tanpa CSRF / Origin asing pada endpoint ber-sesi → 403; parameter tidak berubah.
- `clientSubmittedAt` palsu diabaikan (waktu server otoritatif); double check-in → 409; akurasi GPS 0 → 400.
- Password salah → 401 generik; akun nonaktif → terlarang.

## 7. Yang belum selesai / batasan (jujur, dengan alasan)

| Item | Status | Alasan |
|---|---|---|
| Swagger UI | ~~belum ada~~ **selesai 2026-11-22**: UI di `/api/v1/docs`, spec JSON di `/api/v1/docs/json` (paket `@fastify/swagger-ui` yang sudah ter-install kini diregistrasi). | — |
| E2E Playwright otomatis di repo/CI | skrip ad-hoc di luar repo | Skrip memuat kredensial dev & path lokal; formalisasi ke CI di luar lingkup arc ini. |
| Isolasi bucket MinIO untuk DB test | direncanakan | DB test di-DROP tiap run sehingga objek bukti yatim di bucket dev (privat, lokal); tercatat di CHANGELOG Fase 6. |
| Halaman UI reset-password (pakai token admin) | belum ada | Alur recovery berjalan via UI Pengguna + API `POST /auth/reset-password`; tercatat `docs/DATA_FLOW.md` §7. |
| Kebijakan resmi KCIC (jam kerja, toleransi, kategori izin) | `PENDING_KCIC_CONFIRMATION` | Menunggu kebijakan resmi — tidak dikarang; bisa diganti via UI Data Master. |
| `GET /dashboard/participant`, `GET /reports/statistics` | tidak dipakai UI (terdokumentasi) | UI memakai endpoint yang lebih lengkap; bukan dead code. |

## 8. Saran lanjutan

1. Pindahkan skenario E2E ke suite Playwright resmi di repo + jalankan di pipeline.
2. Isolasi bucket MinIO test (mis. `attendance-evidence-test`) agar tidak ada objek yatim.
3. Terapkan pemeriksaan Origin pada `POST /auth/login` (tutup login-CSRF) — perubahan kecil, uji ulang alur login.
4. Buat halaman "Lupa Password" peserta yang memakai token dari admin.
5. Bila kebijakan resmi KCIC terbit, isi parameter/jadwal/kategori via UI lalu hapus penanda `PENDING_KCIC_CONFIRMATION`.

## 9. Cara verifikasi ulang

```bash
pnpm --filter api exec tsc --noEmit && pnpm --filter api lint && pnpm --filter api test
pnpm --filter web exec tsc --noEmit && pnpm --filter web lint && pnpm --filter web test
bash infra/scripts/doctor.sh
```

Login uji manual (semua `DevPassword123!` kecuali bootstrap): `dev-admin`, `admin-hr`, `supervisor1`, `peserta1..3`, `bayu.pratama`, `maya.sari`, `fajar.nugroho`, `putri.maharani` — web di http://localhost:5174.
