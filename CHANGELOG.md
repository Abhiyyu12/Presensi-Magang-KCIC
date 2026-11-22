# CHANGELOG — Presensi Magang KCIC

Semua perubahan penting proyek ini dicatat di sini. Format mengikuti semangat
[Keep a Changelog](https://keepachangelog.com/id/1.0.0/); tanggal memakai zona waktu proyek (WIB).
Aplikasi ini hanya untuk lingkungan lokal/development dengan data dummy.

## [2026-11-22] — Fase 6: Perbaikan alur inti hasil uji browser (commit `18a20a6`)

### Diperbaiki
- **Critical**: mutasi pertama setelah login selalu gagal 403 "Token CSRF tidak valid" — klien menyimpan token CSRF lama di memori padahal server merotasi cookie saat login/ganti password. Klien kini membaca cookie `csrf_token` sebagai sumber kebenaran (pola double-submit kanonik; ikut memperbaiki staleness antar-tab).
- **Critical**: riwayat pribadi peserta dan ekspor CSV pribadi selalu 0 baris — filter scope pribadi memakai `id` baris hari alih-alih `internProfileId`. Kini riwayat dan CSV berisi data milik sendiri.
- **Critical**: form pengajuan izin peserta selalu gagal memuat kategori (403) karena memanggil endpoint admin `/admin/leave-categories`. Endpoint baru `GET /leaves/categories` (kategori ACTIVE, permission `leave:request`) dipakai form; peserta kini bisa mengajukan izin dari UI.

### Ditambahkan
- Test regresi: cookie CSRF rotasi (web), list riwayat pribadi memuat hari sendiri, CSV pribadi berisi baris, daftar kategori izin peserta + penolakan akun tanpa `leave:request` (API kini 38 test, web 24).
- Keputusan D-028 (endpoint kategori peserta) dan D-029 (sumber token CSRF klien) di `DECISIONS.md`; kontrak `API_CONTRACT.md` §5 diperbarui.

### Diketahui / belum
- Bucket MinIO dipakai bersama oleh DB dev dan DB test yang di-DROP tiap run → objek bukti dari run test menjadi yatim di bucket dev (privat, lokal). Objek yatim dari uji browser Fase 6 sudah dibersihkan; isolasi bucket test direncanakan.
- Sisa data dummy uji Fase 6 di DB dev (riwayat hari ini peserta3 + 2 izin CANCELLED) dibiarkan sebagai contoh data; jadwal uji sementara dan akun `it-uji` dinonaktifkan (INACTIVE) lewat API admin ber-audit.

## [2026-11-22] — Fase 5: Sinkronisasi dokumentasi

### Diubah
- Seluruh dokumen root disinkronkan dengan implementasi nyata (README, AGENT, ARCHITECTURE, API_CONTRACT, DATA_MODEL, DESIGN, SECURITY, TESTING, CODE_QUALITY, IMPLEMENTATION_PLAN, PROMPT_AGENT, RUNBOOK, DECISIONS, REQUIREMENTS_TRACEABILITY, .env.example, setup.sh): URL/port aktual, endpoint yang benar-benar ada, sitasi PRD ke bagian nyata, dan penandaan jujur "BELUM DIOTOMASI" untuk E2E/formatter/dependency-audit/secret-scan/architecture-tests.

### Ditambahkan
- `CHANGELOG.md` (riwayat perubahan per commit).
- `docs/USER_GUIDE.md` — panduan pengguna Bahasa Indonesia sederhana untuk peserta, pembimbing, dan admin.

## [2026-11-22] — Fase 4: Upgrade UX & navigasi (commit `f8a83a8`)

### Ditambahkan
- Navigasi mobile: bottom nav 4 item utama + tombol **Menu** membuka sheet berisi seluruh menu role (Audit & Bantuan kini terjangkau di ponsel).
- Ikon navigasi SVG inline (`NavIcon.tsx`) menggantikan emoji.
- Komponen `SuccessNotice` untuk konfirmasi sukses CRUD Data Master.
- Halaman **Izin Peserta** read-only bagi Pembimbing (`leave:view:scoped`) + node nav baru.
- Beranda peserta: kartu "Absensi hari ini" (status, jam masuk/pulang, akurasi lokasi terakhir), banner pengingat in-app bila belum absen pulang melewati jam jadwal (I-2).
- Riwayat: chip preset **7 hari terakhir / 30 hari terakhir / Bulan ini** (I-1) dan tombol **Unduh CSV** riwayat pribadi (I-3, endpoint baru `GET /attendance/export`, diaudit, tanpa foto/koordinat).
- Config ESLint kedua app (`.eslintrc.cjs`, dependensi yang sudah terpasang) — `pnpm lint` kini benar-benar jalan.
- Test regresi envelope error API + 2 test ekspor CSV pribadi (API kini 36 test).
- `docs/USER_GUIDE.md`, `CHANGELOG.md`, bagian status eksekusi di `docs/AUDIT.md`.

### Diubah
- Layout ditulis ulang: header sticky full-width; sidebar desktop ≤6 item utama + grup "Lainnya"; nama aplikasi/akun truncate satu baris di 360px.
- Label menu pendek satu sumber (seed upsert idempoten + fallback Layout): Beranda, Absen, Izin, Monitoring, Approval, Laporan, Data Master, Akses, Audit, Bantuan, Profil.
- Label event konsisten "Absen Masuk / Absen Pulang" di seluruh UI (sebelumnya Check-in/Check-out).
- Alur absensi: langsung ke layar kamera di hari kerja (hemat 2 tap); syarat kamera/lokasi tetap terbaca di atas kamera.
- Dashboard Admin & Pembimbing memetakan bentuk respons server yang benar (`counts.*`, `todayStats.*`, `todayStatus[]`); kartu tidak lagi "-" palsu.
- Landing ADMIN_IT diarahkan ke Beranda Admin; tautan cepat dashboard disaring sesuai izin pemiliknya.
- Rate limit login dinaikkan 10 → 30 per IP / 15 menit (asumsi NAT/WiFi kantor; tetap ada rem brute-force).
- Tombol aksi baris Data Master menjadi target sentuh ≥44px; DataTable memberi petunjuk geser di layar sempit.

### Diperbaiki
- **Critical**: envelope error API tidak terpakai karena `setErrorHandler` didaftarkan setelah plugin → semua kegagalan tampil generik "Terjadi kesalahan pada server." Kini pesan server terbaca (mis. "Hari ini bukan hari kerja terjadwal…").
- **Critical**: layout desktop rusak (header menjadi kolom kiri setinggi layar).
- Hari non-kerja: chip status tidak lagi bertentangan ("Terjadwal" vs "tidak terjadwal"); tombol absen dinonaktifkan dengan penjelasan, bukan menolak diam-diam.
- UsersPanel menawarkan status akun `DISABLED` yang tidak ada di enum → diganti Aktif/Nonaktif/Ditangguhkan.
- ResourcePanel menutup dialog saat isian tidak valid (error field hilang) → dialog tetap terbuka dengan pesan per field.
- 7 pelanggaran lint (import tak terpakai, `prefer-const`) dibersihkan.

### Diketahui / belum
- Swagger UI belum ada (OpenAPI JSON di `/api/v1/docs/json`).
- Suite E2E Playwright dalam repo belum diotomasi; verifikasi browser memakai skrip ad-hoc di luar repo.
- Satu user Postgres untuk runtime+migrasi (deviation terhadap SECURITY.md, dicatat jujur).
- Kebijakan KCIC (jam kerja, toleransi, kategori izin) masih `PENDING_KCIC_CONFIRMATION`.

## [2026-11-22] — Fase 2–3: Audit UX (commit `b17ee97`)
- Audit per role pada 360/390/1280px dengan bukti browser + curl; 18 temuan berprioritas (F-01…F-18), struktur menu before/after, roadmap, dan 3 usulan improvement di `docs/AUDIT.md`.

## [2026-11-21] — Baseline aplikasi lengkap (commit `ac95ee5`)
- Monorepo pnpm: API Fastify 5 + Prisma 5 + PostgreSQL 17 + MinIO; web React 18 + Vite 5 + Tailwind 3.
- Auth sesi opaque + CSRF + Argon2id; RBAC+ABAC+ReBAC; absensi ber-idempotency dengan bukti selfie privat; alur izin sementara/pulang awal; koreksi admin ber-audit; laporan CSV/XLSX; pusat bantuan.
- Docker Compose satu perintah, seed deterministik idempoten, clean-room verification; 33 test API + 23 test web hijau.