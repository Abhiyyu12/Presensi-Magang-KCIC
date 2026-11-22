# AUDIT UX & KODE — Presensi Magang KCIC

Tanggal: 22 November 2026 · Auditor: agent (peran product designer + full-stack engineer)
Lingkup: audit navigasi, IA, visual, alur kritis, a11y, performa, keamanan dasar, dan konsistensi dokumen; lalu roadmap upgrade.
Metode: baca seluruh kode frontend/backend + seluruh `.md`; jalankan build/lint/test; uji browser otomatis (Playwright) per role pada viewport 360×740, 390×844, dan 1280×800, termasuk alur check-in lengkap dengan kamera palsu + geolocation; inspeksi respons API mentah (curl + inject).

Stack terdeteksi: monorepo pnpm — `apps/api` (Fastify 5 + Prisma 5 + PostgreSQL 17 + MinIO), `apps/web` (React 18 + Vite 5 + Tailwind 3 + TanStack Query + react-router 6). Docker Compose proyek `presensi-kcic`; port host API 3002, web 5174, DB 5433, MinIO 9002/9003.

Status baseline saat audit: test API 33/33 hijau, test web 23/23 hijau, build web hijau, **lint tidak dapat jalan** (lihat F-12).

---

## 1. Ringkasan eksekutif

Aplikasi berfungsi dan aman di lapisan server, tetapi pengalaman pengguna rusak di tiga titik utama:

1. **Semua pesan error server tampil sebagai "Terjadi kesalahan pada server."** di UI karena envelope error API tidak pernah terbentuk (bug urutan registrasi Fastify). Pengguna tidak pernah tahu alasan penolakan (salah sandi, hari libur, check-out sebelum check-in, dsb.). — *Critical, sudah diperbaiki saat verifikasi audit + test regresi.*
2. **Layout desktop rusak**: header menjadi kolom kiri, bukan bar atas, sehingga tampilan desktop membingungkan. — *Critical.*
3. **Dashboard Admin & Pembimbing menampilkan "-"** untuk hampir semua angka karena kunci parsing frontend tidak cocok dengan bentuk respons backend. — *High.*

Ditambah: navigasi mobile memotong menu ke-6+ tanpa jalan masuk lain (Admin kehilangan Audit & Bantuan di ponsel), label menu terlalu panjang untuk layar 360px, dan matriks dokumen banyak klaim usang. Semua temuan di bawah punya lokasi file, dampak, dan rekomendasi; roadmap eksekusi ada di §6.

---

## 2. Temuan terprioritas

Severity: Critical = merusak fungsi/pemahaman utama; High = fungsi penting salah/tidak terjangkau; Medium = friksi nyata; Low = polesan.

| ID | Severity | Area | Lokasi | Dampak bagi pengguna | Rekomendasi |
|----|----------|------|--------|----------------------|-------------|
| F-01 | Critical | Error API | `apps/api/src/app/buildApp.ts` (setErrorHandler semula di akhir, setelah `register` plugin `/api/v1`) | Semua kegagalan (login salah, validasi, konflik, hari non-kerja) tampil generik "Terjadi kesalahan pada server."; pengguna mengira server rusak dan retry tanpa arah | Daftarkan `setErrorHandler` **sebelum** registrasi plugin; pertahankan pesan 4xx Fastify dalam envelope. **Sudah diperbaiki** + test regresi envelope (34 test API hijau) |
| F-02 | Critical | Layout desktop | `apps/web/src/components/Layout.tsx:88` (`min-h-screen lg:flex` membungkus header+nav+main) | Di ≥1024px header jadi kolom kiri setinggi layar; sidebar & konten bergeser; terlihat seperti aplikasi rusak | Pisahkan header ke atas; baris flex hanya untuk sidebar+main |
| F-03 | High | Dashboard Admin | `apps/web/src/routes/AdminDashboardPage.tsx:39-46` vs `apps/api/src/modules/dashboard/routes.ts:158-164` | Keenam kartu ("Izin menunggu approval", "Hadir hari ini", …) selalu "-" padahal server mengirim `counts.{scheduled,checkedIn,late,needsReview,pendingLeaves,staleLeaves}` | Baca dari `counts`; tambah kartu staleLeaves bila berguna |
| F-04 | High | Dashboard Pembimbing | `apps/web/src/routes/SupervisorDashboardPage.tsx:37-44` vs `dashboard/routes.ts:111-125` | 4 dari 5 kartu "-"; daftar "Status peserta hari ini" tidak pernah muncul (server mengirim `todayStats.*`, bukan kunci top-level) | Petakan `todayStats`; backend menambah `pendingLeaves` ter-scope + daftar status peserta per hari (additive, tanpa skema DB) |
| F-05 | High | Navigasi mobile | `Layout.tsx:72` (`bottomNav = navItems.slice(0, 5)`) | Admin di ponsel tidak punya jalan masuk ke Audit & Pusat Bantuan (item ke-6+); tidak ada drawer/overflow | Bottom nav 4 item utama + tombol "Menu" membuka sheet berisi seluruh item role |
| F-06 | High | Landing ADMIN_IT | `apps/web/src/App.tsx:34-42` (`HomeDashboard`) | ADMIN_IT (governance) jatuh ke dashboard peserta → `/attendance/today` 403 → halaman error setelah login | Arahkan pemegang `access:roles:manage`/`admin:audit:view` tanpa izin operasional ke AdminDashboardPage |
| F-07 | Medium | Status hari non-kerja | `AttendancePage.tsx:97` (fallback `'SCHEDULED'`), `ParticipantDashboardPage.tsx:112-129` | Chip "Terjadwal" berdampingan dengan teks "Hari ini tidak terjadwal"; tombol Check-in aktif lalu ditolak server → membingungkan | Fallback `NOT_SCHEDULED`; banner "Hari ini bukan hari kerja terjadwal" + tombol absen dinonaktifkan dengan penjelasan |
| F-08 | Medium | Label menu | `apps/api/prisma/seed.ts:72-85` (FEATURE_NODES), `Layout.tsx:25-47` (fallback) | Label panjang ("Riwayat & Timeline", "Monitoring Absensi", "Report & Statistik") terpotong di bottom nav 360px; tiga versi label berbeda (seed vs fallback vs DESIGN.md) | Label pendek satu sumber: Beranda, Absen, Izin, Riwayat, Monitoring, Approval, Laporan, Data Master, Akses, Audit, Bantuan, Profil; upsert seed idempoten (tanpa perubahan skema) |
| F-09 | Medium | Umpan balik sukses | `apps/web/src/routes/master/ResourcePanel.tsx`, `UsersPanel.tsx` | Simpan/ubah data master menutup dialog tanpa konfirmasi sukses; user ragu apakah tersimpan | Banner.notice sukses sederhana per panel (komponen bersama, tanpa dependensi baru) |
| F-10 | Medium | Tap target | `UsersPanel.tsx:156-197` (aksi text-xs ±16px), tombol kecil lain | Sulit ditekan di ponsel; missed tap | Tinggi minimum 44px (`min-h-touch`) untuk aksi baris & tombol kecil |
| F-11 | Medium | Izin bagi Pembimbing | `App.tsx:72` (guard `/izin`), `LeavesPage.tsx:52` (`scope=mine`) | Pembimbing punya `leave:view:scoped` tapi tidak ada halaman/menu untuk melihat izin peserta binaan | `/izin` read-only `scope=scoped` bila tanpa `leave:request`; node nav "Izin Peserta" ber-`requiredPermissionCode: leave:view:scoped` |
| F-12 | Medium | Lint mati | `apps/web/package.json` & `apps/api/package.json` (script lint) tanpa file konfigurasi ESLint | `pnpm lint` gagal ("No files matching…"/tanpa config); gate kualitas tidak jalan | Tambah `.eslintrc.cjs` minimal memakai dependensi yang sudah terpasang (typescript-eslint, react-hooks) — tanpa dependensi baru |
| F-13 | Medium | Rate limit login per IP | `apps/api/src/modules/auth/routes.ts:58` (max 10 / 15 menit) | Kantor dengan NAT/WiFi bersama: 10 login per 15 menit untuk semua orang → peserta terkunci bersamaan | Naikkan ke 30/15 menit per IP + catat di SECURITY.md; tetap ada rem brute-force |
| F-14 | Low | Ikon nav | `Layout.tsx:191-205` (emoji) | Emoji render beda-beda antar perangkat (sebagian monokrom/hilang); tidak konsisten | Set ikon SVG inline kecil (12 ikon), tanpa dependensi |
| F-15 | Low | Header mobile | `Layout.tsx:91-107` | Nama aplikasi & nama akun wrap 2 baris di 360px; header memakan tinggi | `truncate` + lebar maksimum; nama akun satu baris |
| F-16 | Low | Tabel mobile | `components/DataTable.tsx:41` | Kolom terpotong tanpa petunjuk bahwa tabel bisa digeser | Petunjuk "Geser ke samping untuk kolom lain" pada layar sempit |
| F-17 | Low | Alur absen 6 tap | `AttendancePage.tsx` (explain → capture terpisah) | Login→Beranda→Check-in→Mulai→Buka Kamera→Ambil Foto→Kirim = 6 tap + 2 izin browser | Gabungkan layar explain ke layar capture (syarat tampil di atas kamera); hemat 1 tap tanpa menghapus informasi |
| F-18 | Low | Dokumen usang | lihat §5 | Kontributor/user tersesat (port, URL docs, label menu, path API) | Perbaiki di Fase 5 |

Catatan positif (dipertahankan): waktu server otoritatif WIB; validasi lokasi/urutan event di server; idempotency-key + retry aman; guard permission frontend + enforcement backend; state loading/empty/error sudah ada dan konsisten (`LoadingState`, `EmptyState`, `ErrorState`); focus-visible ring; `prefers-reduced-motion`; tabel dapat diakses keyboard; route lazy-loaded (bundle awal 71 kB gzip).

---

## 3. Navigasi: kondisi sekarang vs usulan

### Sekarang (dari seed FEATURE_NODES + fallback Layout)

| Role | Item sidebar (urut) | Bottom nav mobile (5 pertama) | Masalah |
|------|--------------------|-------------------------------|---------|
| Peserta Magang | Dashboard, Absensi, Izin Tengah Hari, Riwayat & Timeline, Pusat Bantuan, Profil | Dashboard, Absensi, Izin Tengah Hari, Riwayat & Timeline, Pusat Bantuan | Label panjang terpotong di 360px; Profil hanya via menu akun (OK) |
| Pembimbing | Dashboard, Monitoring Absensi, Report & Statistik, Pusat Bantuan, Profil | sama (5) | Tidak ada menu izin peserta (F-11); label panjang |
| Admin HR | Dashboard, Monitoring Absensi, Approval Izin, Report & Statistik, Data Master, Audit, Pusat Bantuan, Profil (8) | 5 pertama saja | **Audit & Bantuan tak terjangkau di ponsel** (F-05); 8 item > batas 5–6 |
| Admin IT | Dashboard, Role & Permission, Audit, Pusat Bantuan, Profil | sama (5) | Landing salah (F-06) |

### Usulan (setelah upgrade)

Prinsip: maks 6 item primer per role + grup "lainnya"; label ≤10 karakter; ikon SVG konsisten; active state jelas; mobile = bottom nav 4 primer + "Menu" (sheet berisi semua item, termasuk Bantuan/Profil/Audit).

| Role | Bottom nav (4+Menu) | Sidebar desktop | Grup di sheet "Menu" |
|------|--------------------|-----------------|----------------------|
| Peserta | Beranda, Absen, Izin, Riwayat + Menu | Beranda, Absen, Izin, Riwayat, Bantuan, Profil | Bantuan, Profil |
| Pembimbing | Beranda, Monitoring, Izin Peserta, Laporan + Menu | Beranda, Monitoring, Izin Peserta, Laporan, Bantuan, Profil | Bantuan, Profil |
| Admin HR | Beranda, Monitoring, Approval, Laporan + Menu | Beranda, Monitoring, Approval, Laporan, Data Master, Audit | Data Master, Audit, Bantuan, Profil |
| Admin IT | Beranda, Akses, Audit, Bantuan + Menu | Beranda, Akses, Audit, Bantuan, Profil | Profil |

Data Master tetap satu halaman bertab (11 tab) — tidak dipecah jadi menu terpisah agar jumlah item nav tetap kecil; tab diberi scroll horizontal + petunjuk (F-16).

Label baru diseragamkan di **seed FEATURE_NODES** (satu sumber kebenaran), fallback Layout, dan dokumen. Upsert seed idempoten → tanpa migrasi skema, tanpa kehilangan data.

---

## 4. Alur kritis (jumlah langkah saat audit)

| Alur | Langkah sekarang | Titik bingung | Target |
|------|------------------|---------------|--------|
| Login → check-in | 6 tap + izin kamera/lokasi | Layar explain terpisah (F-17); error penolakan generik (F-01); hari libur tombol tetap aktif (F-07) | 4 tap; alasan penolakan terbaca; hari libur dijelaskan di muka |
| Check-in → check-out | 3 tap dari Beranda | Tombol Check-out disabled tanpa penjelasan alasan saat belum check-in | Tooltip/teks "Check-out terbuka setelah check-in" |
| Ajukan izin | Beranda→Izin→Ajukan Izin→form→kirim (5 tap) | Form hanya bisa setelah check-in (aturan server) tetapi pesan muncul hanya setelah gagal | Banner syarat check-in di atas form + status izin aktif di Beranda |
| Lihat riwayat | 2 tap | Filter tanggal manual saja | Preset "7 hari / 30 hari / Bulan ini" (usulan I-1) |
| Admin approve izin | 2 tap | — | tetap |

---

## 5. Dokumen usang/salah (ringkasan audit penuh)

Audit lengkap per file dilakukan terhadap 16 `.md` root + `docs/`. Temuan utama (detail baris ada di catatan audit Fase 1):

1. **Port & URL**: README/`.env.example`/`setup.sh` masih menyebut 3000/5173/9000 dan `docs` UI; kenyataan stack 3002/5174/5433/9002/9003 dan OpenAPI hanya JSON di `/api/v1/docs/json` (swagger-ui tidak pernah diregistrasi). README L23, L40, L69-70 usang (dl.min.io sudah mati; mc kini dari GitHub release + bind-mount `infra/bin`).
2. **Lokasi BUILD_LOG**: AGENT.md/IMPLEMENTATION_PLAN/PROMPT_AGENT menyebut `docs/BUILD_LOG.md`; file ada di root. `docs/decisions/` kosong padahal diimplikasikan berisi catatan keputusan (register aktual: `DECISIONS.md`).
3. **Label menu/nama fitur**: DESIGN.md §2, seed FEATURE_NODES, dan fallback Layout.tsx = tiga versi berbeda (lihat F-08).
4. **Path API**: API_CONTRACT §6 menulis `/admin/permissions|feature-tree|policies`; kode `/admin/access/*`. Endpoint nyata belum terdokumentasi: `/auth/csrf`, `/admin/intern-profiles`, `/admin/users/:id/roles`, `/admin/users/:id/password-reset-token`, `/admin/attendance/:id/correction`, `/admin/audit`, `/admin/roles`.
5. **Nama modul/struktur**: ARCHITECTURE.md menyebut `packages/contracts`, `infra/docker`, `web/src/app|modules|styles`, modul `notifications` — tidak ada. DATA_MODEL.md: `schedule_assignments` tidak ada (scope inline di WorkSchedule); `AbacPolicy` tidak terdaftar.
6. **Gate test yang dijanjikan tapi tidak ada**: TESTING.md `pnpm test:e2e` + 14 journey Playwright, CODE_QUALITY architecture tests/dependency audit/secret scan/OpenAPI-checked client — tidak satupun ada; verifikasi frontend selama ini = 23 unit test + uji browser manual. REQUIREMENTS_TRACEABILITY mengutip ID PRD (AUTH-01 dst.) yang tidak ada di PRD.md.
7. **Keamanan**: SECURITY.md menjanjikan user DB least-privilege terpisah untuk runtime vs migrasi; compose memakai satu user initdb untuk keduanya (dicatat sebagai deviation, bukan diubah diam-diam).
8. **BUILD_LOG**: header fase lama masih "IN PROGRESS" padahal entri berikutnya VERIFIED.

Semua diperbaiki di Fase 5 (README, AGENT.md, CHANGELOG.md baru, docs/USER_GUIDE.md baru, plus koreksi targeted pada dokumen lain). Klaim gate yang belum dipenuhi akan ditulis jujur sebagai "belum diotomasi", bukan dihapus diam-diam.

---

## 6. Roadmap eksekusi (Fase 4) + estimasi

Urutan kerja (commit per fase, pesan jelas):

1. **Navigasi & layout** (F-02, F-05, F-06, F-08, F-14, F-15) — ±4 jam
   Restruktur Layout (header atas, flex sidebar+main, bottom nav 4+Menu sheet), label pendek di seed+fallback, ikon SVG, landing ADMIN_IT.
2. **Dashboard benar** (F-03, F-04, F-07) — ±2,5 jam
   Mapping counts/todayStats; backend additive `pendingLeaves`+daftar status peserta untuk supervisor; banner hari non-kerja + tombol absen disabled berpenjelasan; CTA Absen Masuk/Pulang paling menonjol di Beranda peserta dengan status hari ini (jam masuk/pulang, lokasi terakhir).
3. **Konsistensi visual & umpan balik** (F-09, F-10, F-16, F-17) — ±2,5 jam
   Komponen Notice sukses; tap target 44px; petunjuk geser tabel; gabung explain+capture.
4. **Bug High/Critical sisa & akses** (F-11, F-12, F-13) — ±2,5 jam
   Izin read-only pembimbing; konfigurasi ESLint kedua app; rate limit login 30/15 menit + catatan SECURITY.md.
5. **Tiga improvement kecil berdampak** (usulan, §7) — ±3 jam
6. **Fase 5 dokumentasi** — ±2 jam; **Fase 6 verifikasi** (build/lint/test + uji browser 360/390/desktop per role) — ±2 jam.

Total ±18,5 jam kerja agent. Tidak ada perubahan skema DB; perubahan backend hanya additive (field respons baru, endpoint baru ber-guard, label seed via upsert). Rollback = revert commit per fase; seed lama dapat dipulihkan dengan upsert label lama bila diperlukan.

---

## 7. Usulan improvement kecil (maks 3, dipilih paling berdampak & rendah risiko)

Placeholder brief kosong → diusulkan tiga berikut (contoh dark mode & push notification ditolak: biaya besar/infra baru, tidak sepadan untuk MVP lokal):

- **I-1 Filter cepat riwayat**: chip "7 hari", "30 hari", "Bulan ini" di HistoryPage (mengganti input tanggal manual sebagai default; input manual tetap ada). Dampak: peserta langsung melihat rekap bulanan tanpa menghitung tanggal.
- **I-2 Pengingat in-app check-out**: banner di Beranda peserta bila sudah check-in tetapi belum check-out dan waktu server melewati jam pulang jadwal: "Anda belum check-out hari ini." + tombol langsung. Tanpa infra push; memakai data `/attendance/today` yang sudah ada.
- **I-3 Unduh riwayat saya (CSV)**: endpoint additive `GET /attendance/export?scope=mine` ber-guard `attendance:view:own`, memakai ulang infra export yang ada (cap baris sama dengan reports), tombol di HistoryPage. Peserta bisa menyerahkan rekap ke kampus tanpa minta admin.

---

## 8. Asumsi & keputusan "opsi paling sederhana" (dicatat sesuai brief)

1. Bottom nav = 4 item primer + "Menu" (sheet), bukan drawer hamburger — lebih mudah dijangkau satu tangan dan tidak menyembunyikan aksi utama.
2. Label menu pendek satu sumber di seed; istilah teknis dipertahankan hanya bila sudah familiar (Monitoring, Approval, Audit).
3. Hari non-kerja: tombol absen disabled + penjelasan, bukan form yang gagal di server — paling sederhana dipahami; server tetap enforcement.
4. Izin pembimbing = daftar read-only di `/izin` yang sama (bukan halaman baru) — satu rute, dua mode sesuai permission.
5. Export peserta = CSV (bukan PDF/XLSX) — cukup untuk rekap kampus, tanpa dependensi baru.
6. Pengingat = banner in-app (bukan notifikasi push) — tanpa infra baru.
7. Rate limit login dinaikkan 10→30 per IP/15 menit (asumsi kantor NAT bersama); brute-force per akun tetap dibatasi hash Argon2id + pesan generik.
8. Tidak ada dark mode pada upgrade ini (biaya token/warna ganda besar; bukan keluhan utama).
9. Semua teks UI tetap Bahasa Indonesia sederhana; waktu tampil WIB dengan label "WIB".

---

## 9. Bukti verifikasi audit

- Test: API 33/33 → 34/34 setelah fix F-01 + test regresi; web 23/23; build web hijau; lint gagal karena config hilang (F-12).
- Browser otomatis per role & viewport: tangkapan layar dashboard/absensi/izin/riwayat/master/audit; dump item nav desktop & mobile; dump nilai kartu dashboard (membuktikan F-03/F-04); uji `/izin` pembimbing = "Akses ditolak" (F-11).
- Alur check-in end-to-end dengan kamera palsu + geolocation: capture → konfirmasi → kirim; penolakan server (akurasi 0 / hari non-kerja) terbukti tampil generik sebelum fix F-01 (body mentah Fastify flat vs envelope).
- curl mentah membuktikan body 400 flat `{"statusCode":400,"code":"VALIDATION_ERROR",...}` sebelum fix; inject host membuktikan handler tidak terpanggil bila didaftarkan setelah plugin.
- Rate limit login terbukti aktif (429 setelah 10 login/15 menit dari satu IP) — dasar F-13.

---

## 10. Status eksekusi Fase 4 (setelah upgrade)

Semua temuan F-01…F-17 selesai dikerjakan; F-18 (dokumen usang) dikerjakan di Fase 5. Tanpa perubahan skema DB, tanpa dependensi baru.

| Temuan | Status | Catatan implementasi |
|---|---|---|
| F-01 | Selesai | `setErrorHandler` sebelum registrasi plugin + fallback 4xx Fastify ke envelope; test regresi envelope |
| F-02 | Selesai | Layout ditulis ulang: header sticky full-width; flex hanya sidebar+main |
| F-03 | Selesai | AdminDashboard membaca `counts.*`; 6 kartu + tautan cepat |
| F-04 | Selesai | Backend menambah `todayStats.pendingLeaves` + `todayStatus[]` (additive); frontend memetakan langsung |
| F-05 | Selesai | Bottom nav 4 item + tombol "Menu" membuka sheet berisi semua item role |
| F-06 | Selesai | HomeDashboard mengarahkan ADMIN_IT ke AdminDashboardPage |
| F-07 | Selesai | Fallback `NOT_SCHEDULED`; banner hari non-kerja; alur absen tidak ditawarkan di hari libur |
| F-08 | Selesai | Label pendek satu sumber (seed upsert idempoten + fallback Layout + header halaman + label event "Absen Masuk/Pulang") |
| F-09 | Selesai | Komponen `SuccessNotice` dipakai UsersPanel & ResourcePanel (buat/ubah/role/toggle) |
| F-10 | Selesai | Aksi baris UsersPanel/ResourcePanel jadi tombol `min-h-touch` (44px) |
| F-11 | Selesai | Node nav "Izin Peserta" (`leave:view:scoped`); LeavesPage read-only `scope=scoped` untuk pembimbing |
| F-12 | Selesai | `.eslintrc.cjs` di kedua app memakai dependensi terpasang; 7 pelanggaran dibersihkan; lint hijau `--max-warnings 0` |
| F-13 | Selesai | Rate limit login 10 → 30 per IP / 15 menit (asumsi NAT kantor, §8) |
| F-14 | Selesai | `NavIcon.tsx`: 12 ikon SVG inline menggantikan emoji |
| F-15 | Selesai | Brand & nama akun `truncate` satu baris di 360px |
| F-16 | Selesai | DataTable: petunjuk geser khusus layar sempit (`sm:hidden`) |
| F-17 | Selesai | Layar explain digabung ke capture; alur mulai otomatis di hari kerja (hemat 2 tap); syarat tetap terbaca di atas kamera |

Bug tambahan ditemukan & diperbaiki saat eksekusi (di luar daftar audit):

1. **UsersPanel menawarkan status akun `DISABLED`** yang tidak ada di enum `AccountStatus` (ACTIVE/INACTIVE/SUSPENDED) → server menolak 400. Opsi diganti Aktif/Nonaktif/Ditangguhkan sesuai enum.
2. **ResourcePanel menutup dialog saat isian tidak valid**: validasi zod gagal di `mutationFn` melakukan `return` (bukan throw) sehingga `onSuccess` tetap jalan dan error field hilang. Kini throw `ApiError` validasi → dialog tetap terbuka dengan pesan per field.

Improvement kecil (§7): **I-1** chip preset riwayat (7 hari / 30 hari / Bulan ini) selesai; **I-2** banner pengingat absen pulang di Beranda peserta selesai; **I-3** `GET /attendance/export` CSV riwayat pribadi (tanpa koordinat/foto, diaudit `ATTENDANCE_EXPORT_SELF`, ditolak untuk akun tanpa profil peserta) + tombol "Unduh CSV" di Riwayat + 2 test API baru.

Verifikasi pasca-Fase 4: typecheck API & web hijau; lint kedua app hijau; **test API 36/36** (27 integrasi + 9 unit); **test web 23/23**; build web hijau. Verifikasi browser mobile 360/390 + desktop dilakukan di Fase 6.
## 11. Fase 6 — Verifikasi browser alur kritis & temuan tambahan

Uji browser Playwright ad-hoc (di luar repo) pada 390×844 dan 1280×800 menemukan **3 bug alur inti** yang lolos dari test API karena test inject memakai penanganan CSRF/scope secara eksplisit dan tidak pernah membuka form izin sebagai peserta:

| ID | Temuan | Dampak | Perbaikan (commit 18a20a6) | Status |
|---|---|---|---|---|
| F-19 | Token CSRF cache basi pasca-login: login & ganti password merotasi cookie server-side, klien tetap mengirim token lama | Mutasi pertama setelah login selalu 403 "Token CSRF tidak valid" sampai reload | `ensureCsrfToken()` membaca cookie `csrf_token` sebagai sumber kebenaran (double-submit kanonik); fetch `/auth/csrf` hanya bila cookie belum ada (D-029) | Selesai |
| F-20 | Scope pribadi `listAttendance` memakai `{ id: internProfileId }` (id baris hari, bukan id profil) | Riwayat pribadi & CSV pribadi selalu 0 baris | Filter diganti `{ internProfileId }`; test regresi list + CSV berisi baris | Selesai |
| F-21 | Form izin peserta memanggil `/admin/leave-categories` (guard admin) | Peserta selalu 403 → tidak bisa mengajukan izin dari UI | Endpoint additive `GET /leaves/categories` (ACTIVE, `leave:request`); form memakai endpoint itu (D-028); test 200 peserta + 403 non-peserta | Selesai |

Verifikasi akhir Fase 6 (semua perintah exit 0):
- `pnpm --filter api test` → **38/38** (29 integrasi + 9 unit); `pnpm --filter web test` → **24/24**.
- `pnpm --filter api lint`, `pnpm --filter web lint` (`--max-warnings 0`), `pnpm --filter api build`, `pnpm --filter web build` → hijau.
- Golden path peserta (390×844, kamera palsu + geolocation akurasi 12 m): Beranda CTA → Absen Masuk → kamera → konfirmasi → sukses server → Beranda status terbaru → Absen Pulang → sukses → Riwayat baris hari ini → Unduh CSV (berisi baris, tanpa koordinat) → Izin: form memuat kategori → ajukan TEMPORARY → PENDING → detail → Batalkan Pengajuan → CANCELLED. Aturan "satu izin TEMPORARY aktif per hari" terbukti menolak pengajuan kedua saat masih ada yang PENDING.
- Desktop 1280×800: peserta (beranda/absensi lengkap/riwayat+CSV/izin), pembimbing (monitoring 1 baris → detail, laporan), admin-hr (Data Master, Audit 15 baris, Approval). `/approval` sebagai pembimbing menampilkan state "Akses ditolak" dengan benar (approval hanya ADMIN_HR).
- Mobile 360/390 + desktop per role sebelumnya diverifikasi pada Fase 4 (nav, sheet Menu, dashboard, landing IT-only).

Cleanup artefak uji (data dummy, semua lewat API ber-audit atau psql terbatas):
- Jadwal sementara peserta3 (`703a389e-…`, INDIVIDUAL semua hari) → status INACTIVE via `PATCH /admin/schedules/:id`.
- Akun dummy `it-uji` (ADMIN_IT) → INACTIVE via `PATCH /admin/users/:id`.
- 1 baris `workday_snapshots` basi peserta3 (Sabtu, materialisasi sebelum jadwal uji) dihapus saat 0 baris absensi; snapshot hari ini dibiarkan karena sudah direferensikan riwayat.
- 8 baris `file_objects` + 8 objek MinIO yatim (bukti selfie palsu dari run E2E yang diulang) dihapus; 2 objek run terakhir tetap direferensikan riwayat hari ini.
- Sisa dummy yang dibiarkan sebagai contoh: riwayat hari ini peserta3 (NEEDS_REVIEW karena pulang jauh sebelum jam jadwal tanpa izin) + 2 izin CANCELLED.

Known limitation baru: bucket MinIO dipakai bersama DB dev dan DB test (`attendance_test` di-DROP tiap run) sehingga objek bukti run test menjadi yatim di bucket dev (privat, localhost). Isolasi bucket test direncanakan; tidak mempengaruhi keamanan produksi karena stack ini lokal-only.
