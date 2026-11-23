# CHANGELOG — Presensi Magang KCIC

Semua perubahan penting proyek ini dicatat di sini. Format mengikuti semangat
[Keep a Changelog](https://keepachangelog.com/id/1.0.0/); tanggal memakai zona waktu proyek (WIB).
Aplikasi ini hanya untuk lingkungan lokal/development dengan data dummy.

## [2026-11-23] — Redesign UI per brief: identitas "rel KCIC", tipografi karakter, motion kecepatan terkendali

### Diubah (visual/UX/motion saja — logika, routing, kontrak API, dan struktur data tidak disentuh)
- **Fondasi desain** (brief §Identitas): merah **#8B1A1A tetap** (hanya turunan hue yang sama: hover/pressed/tint/ring); **satu aksen kedua amber** (`--kcic-accent #b45309`) menggantikan ungu chip "Perlu Review"; netral biru-abu diganti **stone hangat**; **tipografi Sora (judul) / DM Sans (body) / IBM Plex Mono (ID, UUID, waktu, kode audit)** — self-host latin subset, `font-display: swap`, tanpa dependency runtime; **`tabular-nums` global** untuk semua angka/jam/tanggal.
- **Token motion terpusat** `lib/motion.ts` — "kecepatan yang terkendali": skala durasi instant 100 / fast 160 / base 240 / slow 400 / hero 600 ms, kurva ease-out-expo masuk & ease-in-out perpindahan, spring stiffness 300 damping 30 tanpa bounce; varian fadeUp/fadeIn/scaleIn/slideInLeft + stagger 45 ms; `MotionConfig reducedMotion="user"` membungkus App sehingga **`prefers-reduced-motion` mematikan seluruh gerak**. Hanya `transform`+`opacity`; entrance hanya sekali saat mount pertama (filter/refresh/pagination tidak mengulang animasi).
- **Shell**: sidebar dikelompokkan (Operasional / Administrasi / Lainnya), indikator aktif merah berpindah mulus antar item (`layoutId`), badge jumlah pengajuan menunggu di Approval, collapse + tooltip desktop; topbar breadcrumb.
- **Login**: dua panel desktop (panel brand merah + panel form), motif streak diagonal (satu-satunya motif rel di app), orkestrasi masuk, **shake saat gagal**, ikon mata crossfade lihat/sembunyi. Tagline diperbarui (satu-satunya perubahan teks yang diizinkan brief).
- **Beranda**: kartu statistik dengan ikon + angka count-up (AnimatedNumber), segmented control pil geser (Hari Ini/Minggu Ini/Bulan Ini), grafik bar bertulang grid + tooltip hover + legend, penanda "perlu tindakan" berdenyut halus.
- **Tabel (Monitoring/Laporan/Audit/History)**: header sticky dalam kontainer scroll, row stagger maksimal 12 baris, chip status crossfade, indikator fetch saat refetch, kolom waktu/ID memakai mono, tombol salin untuk UUID objek audit, badge aksi semantik (LOGIN netral / LOGIN_FAILED merah / LOGOUT abu / EVIDENCE_ACCESS amber), teks header tanpa ALL-CAPS.
- **Laporan**: 12 metrik dikelompokkan 3 seksi (Kehadiran / Kelengkapan / Izin & Koreksi) dengan penanda titik rel; tombol ekspor CSV/XLSX memberi umpan balik sibuk→centang.
- **Data Master & Pengguna & Hak Akses**: komponen **Tabs** baru — indikator pil merah geser (`layoutId`) + tick "penanda rel" pada tab nonaktif, konten tab crossfade; toolbar filter digabung **satu baris** (cari + filter + Import Excel + Tambah Pengguna); kolom Aksi satu baris ikon; badge role memakai mono konsisten; empty state **"Pilih role dahulu"** di panel Hak Akses.
- **Approval**: empty state mengikuti filter status (menunggu/disetujui/ditolak) dengan pesan kontekstual; notice hasil keputusan (disetujui/ditolak).
- **Bantuan**: daftar artikel jadi **accordion** (chevron berputar 180°, body membuka halus, pratinjau saat tertutup), badge **Draf** amber, ikon kaca pembesar di pencarian.
- **Profil**: header merah dengan motif streak diagonal, avatar lebih besar, seksi tetap Informasi Akun/Keamanan, tombol Simpan memberi umpan balik loading→centang.
- Aksesibilitas & responsif: fokus terlihat di semua kontrol interaktif, target sentuh 40–44px, status tidak hanya warna (teks badge tetap ada), `aria-live` pada notice; dicek 360/768/1440.
- Perbaikan kecil: `aria-label` dropdown Data Master "Filter biro" → **"Filter direktorat"** (menyamai istilah UI yang sudah berbahasa Indonesia).

### Pembuktian (bukan klaim)
- Gate per fase (6 commit): web `tsc -b` + `eslint --max-warnings 0` bersih; vitest **48/48** sebelum tambahan test terakhir; `pnpm build` sukses (17,23s); container web di-rebuild dan live di 5174.
- **Playwright live 21/22 PASS** (`f8-verify-redesign.py`, screenshot `f8-*.png`, admin-hr, 360px & 1440px): header tabel `position: sticky` terbukti computed; header tabel tanpa uppercase; label 3 seksi Laporan + tombol Ekspor CSV/XLSX ada; chip aksi Audit mono + tombol "Salin ID objek" ada; tab Master `aria-selected` benar + toolbar satu baris (Cari pengguna, Import Excel, Tambah Pengguna); empty Approval sesuai filter; accordion Bantuan (`aria-expanded`, chevron `rotate-180`, tautan "Baca halaman lengkap", ikon pencarian); Profil memuat motif `.speed-lines` + avatar terukur 64px; **reduced-motion: `animationDuration` 1e-05s (animasi mati) tapi konten tetap terlihat**; tanpa console error di luar probe 401 login.
- **1 "gagal" dari 22 bukan bug UI**: cek empty state /access memakai admin-hr yang memang **tidak punya izin** halaman akses → redirect ke Beranda (route guard terbukti bekerja). Sandi dev-admin berasal dari env `BOOTSTRAP_ADMIN_PASSWORD` (tidak tersedia di sesi ini); audit DB menunjukkan hanya dev-admin/admin-it memegang `ADMIN_IT`. Item ditutup dengan **test jsdom baru** `RolesPermissionsPanel.test.tsx` yang membuktikan empty state "Pilih role dahulu" ter-render — vitest kini **49/49** (8 file).
- Keputusan desain yang dicatat: **notis inline dipertahankan alih-alih toast global** — brief menawarkan toast, tetapi pilihan sebelumnya (tervalidasi bersama user) dipertahankan agar tidak menumpuk notifikasi di app yang penuh dialog; semua teks UI tidak diubah kecuali typo (tagline login diizinkan brief).
- Fitur dijamin tidak disentuh: filter, pagination, tab, ekspor CSV/XLSX, import Excel, aksi tabel, collapse sidebar, dan alur kamera absensi — selector uji (`tab-users`, `tab-schedules`, `access-tab-*`) dipertahankan lewat props `tabId`/`panelId` pada komponen Tabs.

## [2026-11-23] — Upgrade UI/UX: layer animasi halus di seluruh aplikasi

### Ditambah
- **Bahasa gerak yang konsisten** (permintaan user: "upgrade ui/ux biar tampilannya bagus"): semua animasi ≤300ms, hanya properti `transform`+`opacity` (GPU, tidak memicu layout), kurva ease-out kuat dari token baru `--ease-out-strong` / `--ease-drawer` di index.css, dan **otomatis dimatikan oleh `prefers-reduced-motion`** (blok CSS global yang sudah ada + `MotionConfig reducedMotion="user"`).
- **Dialog keluar-masuk halus** — backdrop fade 180ms, panel scale 0.96→1 + naik 12px (220ms), keluar simetris via `AnimatePresence` dari library **`motion`** (satu-satunya dependency baru; dipilih alih-alih GSAP karena deklaratif untuk React dan sesuai tips user "pilih salah satu GSAP atau Motion"; exit animation memang mustahil dengan CSS murni). Berlaku otomatis untuk SEMUA dialog app (Tambah/Ubah/Hapus, konfirmasi, wajib ganti sandi). **Lenis smooth-scroll sengaja tidak dipakai** — scroll hijack mengganggu app dashboard yang banyak form/dialog; bisa ditambah belakangan bila diminta.
- **Transisi halaman**: konten utama naik-halus 180ms tiap pindah route (key per pathname).
- **Stagger dashboard**: kartu Beranda (peserta, admin, pembimbing) masuk bergiliran 40ms.
- **Drawer HP**: panel geser dari kiri 220ms (kurva drawer ala iOS) + backdrop fade.
- **Dropdown halus**: menu akun header & dropdown MasterCombobox pop 150ms dengan transform-origin di pemicu.
- **Momen sukses absen**: kartu hijau naik halus + ikon centang baru yang pop (satu-satunya momen "delight" — aksi paling penting app).
- **Feedback tekan tombol**: semua tombol `.btn`/`.btn-icon` mengecil halus (scale 0.98/0.96, 150ms) saat ditekan.

### Pembuktian (bukan klaim)
- Gate: web tsc+eslint bersih + vitest **48/48** (termasuk 2 test fokus ConfirmDialog — perilaku fokus & restore focus saat tutup tidak berubah).
- Playwright live **16/16 OK** (login dev-admin + peserta1; log `uat_animasi.py`, screenshot `anim_*.png`): computed style membuktikan `rise-in` terpasang di `main` tiap pindah halaman & stagger anak ke-2 delay 0.04s; dialog buka→tutup bersih (exit tidak meninggalkan DOM); dropdown combobox Jadwal-INDIVIDUAL tampil (9 opsi) dan opsi tetap bisa dipilih; drawer HP buka/tutup bersih; menu akun & dropdown ter-animasi; **reduced-motion: durasi 1e-05s tapi konten tetap terlihat**; nol error console di luar probe sesi 401 saat login.
- Fungsional tidak disentuh: alur kamera getUserMedia absensi tetap apa adanya, selector/data/kontrak API tidak berubah.

## [2026-11-23] — Admin bisa reset kata sandi pengguna di Data Master > Pengguna

### Ditambah
- **Reset kata sandi oleh admin** (permintaan user: "di pengguna juga bisa liat pasword usernya dong dan bisa di edit"). Kata sandi tersimpan sebagai hash argon2 (satu arah) sehingga **tidak mungkin ditampilkan** — yang diberikan adalah penggantian:
  - Dialog **Ubah Pengguna** punya seksi **"Reset kata sandi"**: field opsional "Kata sandi baru" dengan tombol **Lihat/Sembunyikan** (hanya untuk sandi baru yang sedang diketik), catatan "Kata sandi lama tidak dapat dilihat siapa pun — sistem menyimpan hash, bukan teks asli", dan hint "Minimal 10 karakter. Jika diisi, semua sesi aktif pengguna dicabut dan harus login ulang dengan sandi baru."
  - Endpoint baru `PATCH /admin/users/:id/password` (izin `admin:users:manage`, scope global): validasi min 10 karakter (sama dengan backend), hash argon2id, **mencabut semua sesi aktif pengguna di semua perangkat** (transaksi), dan mencatat audit `ADMIN_USER_PASSWORD_RESET` — **nilai sandi tidak pernah dicatat ke audit**, hanya `passwordChanged: true`.
- Dialog **Tambah Pengguna**: validasi kata sandi awal disamakan dengan backend, **8 → 10 karakter** (label kini "Kata sandi awal (min. 10 karakter)").

### Pembuktian (bukan klaim)
- Gate: api tsc+eslint bersih + test **98/98** (test baru: reset → login sandi lama 401 → login sandi baru 200 → sesi lama dicabut → hash berganti & verify gagal/sukses → 2 baris audit & JSON audit bebas nilai sandi; sandi 9 karakter ditolak 400 "minimal 10 karakter"); web tsc+eslint bersih + test **48/48**.
- Playwright live **8/8 OK** (login dev-admin; log `uat_resetpw.py`, screenshot `resetpw_*.png`): sandi 5 karakter ditolak dengan pesan jelas; seksi Reset kata sandi + tombol Lihat berfungsi (type password↔text); reset sandi peserta2 via UI berhasil dengan notice "Kata sandi baru aktif dan semua sesi lama pengguna telah dicabut"; **login peserta2 dengan sandi baru berhasil**; sandi peserta2 dikembalikan ke `DevPassword123!` (login asli kembali OK) — tidak ada data uji yang tertinggal.

## [2026-11-22] — Autofill tanggal berlaku di Cakupan & Jadwal dari periode magang pengguna

### Ditambah
- **Tanggal terisi otomatis dari data pengguna yang sudah ada** (permintaan user: "jika ada data yang bersangkutan dengan userid itu dia bisa keisi otomatis, jika belum ada datanya baru bisa diisi"):
  - **Data Master > Cakupan**: memilih **Pengguna** yang punya profil magang otomatis mengisi **Berlaku dari** (tanggal mulai magang) dan **Berlaku sampai** (tanggal selesai magang, bila ada). Tanggal tetap bisa diubah manual; pengguna tanpa profil magang tidak mengisi apa pun.
  - **Data Master > Jadwal** cakupan **Peserta (individu)**: memilih peserta otomatis mengisi Berlaku dari/sampai dari periode magang profil peserta tersebut (aturan yang sama: bisa diubah manual, peserta tanpa tanggal tidak mengisi).
- Mekanisme: opsi combobox kini membawa data tambahan (`meta`) dari baris sumber (tanggal `startDate`/`endDate` profil); form memakainya saat opsi dipilih. Tidak ada perubahan API/backend — data sudah tersedia di endpoint daftar pengguna & profil peserta.
- Hint baru di field Pengguna (Cakupan): "Tanggal berlaku terisi otomatis dari periode magang pengguna yang dipilih (bila ada) dan tetap bisa diubah."

### Pembuktian (bukan klaim)
- Gate: web tsc+eslint bersih + test **48/48**.
- Playwright live **9/9 OK** (login dev-admin; log `uat_autofill.py`, screenshot `autofill_scope_*.png` / `autofill_jadwal_*.png`): peserta1 (magang 2026-10-23, tanpa akhir) → Berlaku dari terisi, Berlaku sampai tetap kosong; oioi (2026-11-22 s.d. 2026-12-22) → keduanya terisi lalu Berlaku dari berhasil diubah manual; dev-admin (tanpa profil) → tanggal tetap kosong; jadwal individu peserta1 → Berlaku dari terisi 2026-10-23. Tidak ada data uji yang tersimpan (semua dialog ditutup tanpa Simpan).

## [2026-11-22] — Istilah teknis di Data Master jadi Bahasa Indonesia + deskripsi bantuan tiap isian

### Diubah
- **Kode mentah English tidak lagi tampil di UI** (permintaan user: "jangan berbahasa asing, kasih deskripsi biar nggak bingung"):
  - Tab **Cakupan**: dropdown "Tipe scope GLOBAL/BUREAU/DIVISION" kini **"Tipe cakupan"** dengan opsi **"Global (semua data) / Direktorat / Biro"**; kolom daftar "Tipe" juga menampilkan label Indonesia, bukan `BUREAU`/`DIVISION`.
  - Tab **Jadwal**: label "Tipe scope" kini **"Cakupan"** dengan opsi berpenjelasan: **"Global — semua peserta", "Direktorat — satu direktorat", "Biro — satu biro", "Peserta (individu) — satu peserta"**; kolom daftar "Scope" kini "Cakupan" dengan label Indonesia.
  - Tab **Kalender**: kolom "Jenis" tak lagi menampilkan `NORMAL/HOLIDAY/WORKING_EXCEPTION`, kini **"Normal / Libur / Masuk khusus (pengecualian)"**.
- **Deskripsi bantuan tiap isian penting** (teks kecil abu-abu di bawah input, fitur `hint` baru di config field — dipakai seragam di semua form Data Master):
  - Cakupan → Tipe cakupan: "Global = boleh semua data; Direktorat = hanya data di satu direktorat; Biro = hanya data di satu biro."
  - Cakupan → Objek cakupan: "Diisi hanya untuk tipe Direktorat atau Biro."
  - Cakupan → Berlaku dari: "Cakupan hanya aktif di antara kedua tanggal ini; kosongkan Berlaku sampai bila tanpa batas waktu."
  - Jadwal → Cakupan: "Saat peserta absen, dipakai jadwal paling spesifik yang berlaku: individu > biro > direktorat > global."
- Nilai yang dikirim ke server tetap `GLOBAL/BUREAU/DIVISION/INDIVIDUAL/NORMAL/HOLIDAY/WORKING_EXCEPTION` — hanya tampilan yang diterjemahkan, kontrak API tak berubah.

### Pembuktian (bukan klaim)
- Gate: web tsc+eslint bersih + test **48/48**.
- Playwright live **13/13 OK** (login dev-admin; log `uat_istilah_scope.py`, screenshot): label & opsi Cakupan/Jadwal Indonesia + hint tampil; kolom daftar tanpa kode mentah `BUREAU/DIVISION`; Kalender dibuat 1 baris uji "Libur" → kolom Jenis tampil "Libur" → baris dihapus via tombol Hapus (DB kembali 0 baris).

## [2026-11-22] — Istilah struktur organisasi KCIC: bureaus = Direktorat, divisions = Biro

### Diubah
- **Sesuai informasi tree organisasi KCIC dari user** (`departments` = Direktorat level atas → `divisions` = Biro/Sub-Divisi, FK ke parent): sistem sudah cocok 1:1 (`bureaus` = level atas, `divisions` = anak dengan FK `bureau_id`), jadi **cukup ganti istilah tanpa perubahan schema/tabel/endpoint/DB** — tebakan user benar ("keknya cuman ganti nama aja").
- Pemetaan istilah: tab/kolom/form/filter **Biro → Direktorat**, **Divisi → Biro**. Berlaku seragam di: Data Master (tab, form "Nama direktorat"/"Nama biro", kolom, placeholder, dialog detail), dialog Tambah/Ubah Pengguna (combobox Direktorat + Biro + hint "Pilih direktorat terlebih dahulu."), filter "Semua direktorat"/"Semua biro" di dashboard admin/Monitoring/Laporan/Pengguna, kolom tabel Approval/Monitoring/Laporan, kartu data peserta beranda & profil, dialog import, label scope jadwal & cakupan. Kode teknis TIDAK diubah (field `bureauId`/`divisionId`, endpoint `/admin/organizations/bureaus|divisions`, kode seed BIO-OPS dll tetap).
- Backend ikut konsisten: pesan error/guard 422 ("Direktorat masih dipakai N biro dan M profil peserta…", "Biro masih dipakai N profil peserta…", "Direktorat untuk scope jadwal tidak ditemukan.", dsb.), template import Excel (kolom **Direktorat** & **Biro**, petunjuk, contoh "Direktorat Operasi"), header laporan Excel (Direktorat | Biro), seed (Direktorat Operasi/Teknik, Biro di bawahnya). **Template import lama tak akan terbaca** (header kolom cocok persis) — unduh ulang template, pesan errornya jelas.
- Data dev disesuaikan: nama bureaus/divisions di-rename mengikuti istilah baru (incl. "Biro Verifikasi F0" milik akun abhi — hanya nama, data & relasi utuh); 1 baris sampah UAT lama (`REPRO-ORG`, 0 referensi) dihapus.

### Pembuktian (bukan klaim)
- Gate: **api tsc+eslint bersih + test 97/97**, **web tsc+eslint bersih + test 48/48** (mock combobox test ikut istilah baru).
- Playwright live 14/14 OK (log `uat_istilah.py`, screenshot): tab Direktorat & Biro tampil di Data Master, istilah "Divisi" hilang dari seluruh halaman yang dicek (master, dashboard), kolom "Direktorat" di tab Biro, form "Nama biro"+"Direktorat", filter dashboard, dialog pengguna setelah centang "Jadikan peserta magang" menampilkan Direktorat/Biro.
- Docker api+web rebuilt & healthy; verifikasi DB: 2 bureaus + 3 divisions dengan nama baru.

## [2026-11-22] — UAT: Data Master kini punya Hapus (D) di tab yang bisa dihapus + validasi nilai parameter di backend

### Ditambahkan
- **Tombol Hapus di Data Master** (keluhan user: "blom bisa crud cuma bisa edit aja" — penyelidikan live membuktikan Create sudah jalan di semua tab; yang memang belum ada adalah Delete). Kini **Biro, Divisi, Penempatan, Kalender, Kategori Izin, Cakupan (Scope)** punya tombol Hapus di kolom Aksi (`ResourcePanel`), dan **Jadwal** punya tombol Hapus sendiri (`SchedulesPanel`); Role sudah punya dari sebelumnya. Parameter sengaja tidak bisa dihapus (parameter operasional, cukup diubah). Hapus lewat dialog konfirmasi "Ya, Hapus"; error tampil di dalam dialog.
- **7 endpoint DELETE backend dengan guard referensi**: `DELETE /admin/organizations/bureaus|divisions/:id`, `/admin/placements/:id`, `/admin/schedules/:id`, `/admin/calendar/:id`, `/admin/leave-categories/:id`, `/admin/scopes/:id`. Jika data masih dipakai (mis. Biro dipakai divisi/profil peserta, Jadwal dipakai snapshot hari kerja, Kategori Izin dipakai pengajuan), server **menolak dengan 422 + pesan Bahasa Indonesia "… masih dipakai N … Nonaktifkan bila tidak lagi digunakan."** — konsisten dengan aturan "jangan hapus data yang sudah berhubungan". Penghapusan berhasil ditulis ke audit (`ADMIN_*_DELETE`) dalam satu transaksi. Penempatan hierarki dihormati: Divisi hanya di bawah Biro yang dicakup, Scope/Parameter admin global.

### Diperbaiki
- **Bug nyata ketemu saat UAT**: nilai `business_parameters` belum tervalidasi di backend — nilai `default_workdays` `[0..6]` (terindeks 0) sempat tersimpan lewat UI dan membuat default dialog Jadwal salah (Sabtu ikut terhitung hari kerja; form jadi menuntut jam masuk/pulang Sabtu). Sekarang `validateBusinessParameterValue` memvalidasi **`default_workdays` = array integer 1–7 (1=Senin … 7=Minggu) tanpa duplikat** dan **`late_tolerance_default_minutes` = bilangan bulat 0–240**, berlaku di POST dan PATCH; data dev dipulihkan ke `[1,2,3,4,5]`.

### Pembuktian (bukan klaim)
- Gate: **api tsc+eslint bersih + test 97/97** (6 test baru: rantai Biro→Divisi→Penempatan create+delete + guard 422; Kategori Izin create+delete + guard via pengajuan asli; Scope create 200 + admin-hr 403 + delete; Jadwal + guard snapshot + delete; Kalender + guard snapshot + delete; Parameter invalid ditolak 422 tanpa mengubah data) — **web tsc+eslint bersih + test 48/48**.
- UAT live Playwright (`uat_master_hapus.log`): guard terbukti di UI — Biro "masih dipakai 3 divisi dan 7 profil peserta", Penempatan "masih dipakai 5 profil peserta", Kategori Izin "masih dipakai 6 pengajuan izin", Jadwal "direferensikan oleh 1 snapshot hari kerja", Kalender menyebut tanggalnya; create+delete sukses di semua tab (Role & Cakupan lewat login dev-admin karena permission berbeda). DB dev diverifikasi kembali bersih dari baris uji.
- 21 foto sampah 1.2KiB hasil run-test disapu dari MinIO (sisa: 8 bukti ber referensi DB — termasuk upload asli user `abhi` — dan 294 objek `_unlinked/` yang masih menunggu konfirmasi user).

## [2026-11-22] — UAT: jarak scrollbar dialog Data Master diperbaiki (tidak lagi menempel ke inputan)

### Diubah
- **Inputan di dalam dialog Data Master tidak lagi menempel ke scrollbar**: badan gulir dialog Tambah/Ubah Pengguna, dialog detail pengguna, dialog Biro/Divisi/Penempatan (ResourcePanel), dan dialog Jadwal sebelumnya hanya memberi jarak 4px (`pr-1`) antara ujung input/select dan scrollbar — di Windows scrollbar native yang tebal terlihat "mepet" ke inputan (keluhan user: "selectnya masih terlalu mepet / paddingnya masih ga bener"). Kini jaraknya **16px (`pr-4`)** dan scrollbar-nya diganti **versi tipis bulat abu-abu (`scroll-slim`, 8px)** — jauh lebih lapang dan rapi; scrollbar native tebal dengan panah hitam tidak lagi muncul di dalam dialog. Utility CSS `scroll-slim` ditambahkan di `index.css` (WebKit + Firefox `scrollbar-width: thin`), tanpa dependensi baru.

### Pembuktian (bukan klaim)
- Gate: web tsc+eslint bersih + test **48/48**.
- Playwright (admin-hr, 1440px): jarak terukur ujung input → tepi area gulir = **16px** (sebelumnya 4px); dialog dicentang "Jadikan peserta magang" → seksi inputan peserta terlihat penuh dengan select Biro/Divisi/Penempatan lapang. Screenshot.

## [2026-11-22] — UAT: dialog Tambah/Ubah Pengguna diperlebar + auto-scroll ke inputan peserta

### Diubah
- **Dialog "Tambah Pengguna" dan "Ubah Pengguna" diperlebar dari 448px (max-w-md) menjadi 672px (max-w-2xl)** — permintaan user: "selectnya kepotong". `ConfirmDialog` mendapat prop opsional `wide` sehingga dialog lain (hapus, konfirmasi, detail) tidak berubah; prop ini dipakai khusus di dua dialog pengguna yang memuat seksi Data peserta magang (Nomor peserta, combobox Biro/Divisi/Penempatan, tanggal, status). Select di dalamnya kini lega penuh dan tidak terpotong.
- **Saat centang "Jadikan peserta magang", badan dialog otomatis menggulir halus ke seksi "Data peserta magang"** — permintaan user: "kalo cuman ceklis doang ga keliatan inputannya". Sebelumnya inputan peserta muncul di bawah lipatan (di bawah daftar role) dan harus dicari manual dengan scroll; sekarang langsung "narik" pandangan ke inputannya. Berlaku juga di dialog Ubah Pengguna (untuk pengguna yang belum punya profil).

### Pembuktian (bukan klaim)
- Gate: web tsc+eslint bersih + test **48/48**.
- Playwright desktop 1440px (admin-hr): lebar dialog terukur **672px** (sebelumnya 448px); centang checkbox → scroll container bergerak ke 501px, seksi "Data peserta magang" **terlihat penuh di dalam viewport dialog** (bounding box di dalam batas body dialog); uncheck → centang ulang tetap menggulir. Screenshot.
- Playwright mobile 360px: dialog 328px (muat), auto-scroll bergerak (scrollTop 526), select Biro/Divisi/Penempatan full-width tanpa terpotong. Screenshot.

## [2026-11-22] — UAT: No. HP terima kode negara + (semua negara), kolom HP template bertipe teks

### Diubah
- **Akar masalah Excel**: kolom No. HP di template dulu berformat umum — Excel memperlakukan `081234567890` sebagai **angka** sehingga 0 di depan hilang (jadi `81234567890`), dan `+62…` dieksekusi sebagai formula. Sekarang **kolom No. HP (D) bertipe teks** (numFmtId 49, baris 2–201): Excel menyimpan persis apa yang diketik, 0 di depan dan tanda `+` tetap utuh. Ditambah validasi Excel `textLength` 8–16 karakter dengan petunjuk/error Bahasa Indonesia saat sel dipilih/diisi salah.
- **Validasi No. HP diperlongir sesuai usulan user**: selain format Indonesia (`08xxxxxxxxxx` / `62xxxxxxxxxx` — bentuk tanpa `+` ini tetap diterima karena biasanya artefak sel angka Excel), kini **kode negara + apa pun diterima** (E.164, 7–15 digit setelah `+`, mis. `+6281234567890`, `+811234567890`). Regex baru `^(?:08\d{7,12}|62\d{8,13}|\+\d{7,15})$` dipakai **seragam** di profil (PATCH /profile), admin create/update user, dan import Excel — satu sumber di `phoneIdSchema`/`PHONE_PATTERN`, tidak di-hardcode dua kali. Pesan error diganti jadi: "No. HP tidak valid. Gunakan 08xxxxxxxxxx atau awali kode negara, mis. +6281234567890."
- UI profil: hint kolom Telepon diganti "Isi 08xxxxxxxxxx atau kode negara, mis. +6281234567890."; regex mirror frontend mengikuti backend. Petunjuk template (sheet Petunjuk poin 6) + docs (ADMIN_GUIDE, USER_GUIDE, LAPORAN_AKHIR asumsi #6) ikut disesuaikan.

### Pembuktian (bukan klaim)
- Gate: api tsc+eslint bersih + test **91/91** (+1 test baru: `+62…` dan `+81…` lolos validate, `81234567890` tanpa awalan ditolak dengan pesan jelas; PATCH /profile `+811234567890` = 200; template assert kolom D `textLength` + format teks). Web tsc+eslint bersih + test **48/48**.
- Template hasil unduhan diperiksa XML-nya: `<dataValidation type="textLength" ... sqref="D10:D201">` dengan `<formula1>8</formula1><formula2>16</formula2>`; sel `D2`–`D201` memakai style `numFmtId="49"` (teks); validasi tanggal & dropdown DataMaster tidak berubah.
- Playwright (peserta1, 390px): hint baru tampil; isi `+811234567890` → Simpan → tanpa error → **setelah reload nilai tetap `+811234567890`** (backend benar-benar menyimpan); lalu dikembalikan ke nilai asli `081234567804` dan diverifikasi di DB.
- 10 sampah foto 1.2KiB run-test disapu dari MinIO.

## [2026-11-22] — UAT: kolom tanggal template import kini bertipe tanggal (validasi + format yyyy-mm-dd)

### Ditambahkan
- **Kolom tanggal pada sheet `Pengguna` (Tanggal Mulai / Tanggal Selesai, kolom J & K) kini bertipe tanggal di Excel**: tampilan sel dipaksa format `yyyy-mm-dd`, lengkap dengan **validasi rentang 2020-01-01 s.d. 2035-12-31** — Excel menolak langsung nilai di luar rentang atau bukan tanggal, dengan pesan Bahasa Indonesia ("Tanggal tidak valid — Isi tanggal format YYYY-MM-DD (mis. 2026-01-15) antara tahun 2020-2035.") dan petunjuk saat sel dipilih ("Isi tanggal, mis. 2026-01-15."). Validasi dipasang di baris 2–201 (kapasitas maksimal impor).
- **Batasan teknis yang jujur**: format .xlsx **tidak punya popup kalender bawaan** — date picker popup hanya bisa lewat macro/VBA yang diblokir di sebagian besar environment (termasuk yang memicu masalah link eksternal sebelumnya). Alternatif standar Excel untuk ini adalah sel bertipe tanggal + validasi + format tampilan, yang kini dipakai. Saat sel tanggal dipilih, Excel menampilkan petunjuk format; isi bisa diketik `2026-01-15` dan Excel menyimpannya sebagai tanggal asli.
- **Parser impor sudah mendukung sel tanggal bertipe Date** (nilai dari sel berformat tanggal dikonversi ke `YYYY-MM-DD` di backend) — ditambah test regresi: workbook dengan sel tanggal asli Date tervalidasi tanpa error.

### Pembuktian (bukan klaim)
- Gate: api tsc+eslint bersih + test **90/90**.
- Template hasil unduhan dari API dev diperiksa XML-nya: `<dataValidation type="date" ... sqref="J10:K201">` dengan `<formula1>43831</formula1>` (serial Excel 2020-01-01) dan `<formula2>49674</formula2>` (2035-12-31); styles.xml memuat `formatCode="yyyy-mm-dd"`; tidak ada folder `xl/externalLinks`.
- **Catatan ExcelJS (jebakan implementasi)**: untuk validasi `type: 'date'`, ExcelJS selalu mengonversi formula via `dateToExcel(new Date(formula))` — formula string `'=DATE(2020,1,1)'` menghasilkan `NaN` di XML; formulae wajib objek `Date`.
- **Pengguna perlu mengunduh ulang template sekali lagi** (file sebelum fix fitur tanggal tidak punya validasi ini).

## [2026-11-22] — UAT: perbaikan template import pengguna (Excel "UNABLE TO REFRESH")

### Diperbaiki
- **Critical (bug UAT)**: template import pengguna yang diunduh memunculkan peringatan Excel **"UNABLE TO REFRESH — We couldn't get updated values from a linked workbook"** dengan entri Workbook Links bernama *DataMaster* ("This link exists in a data validation rule"). Akar masalah: sheet tersembunyi di dalam template dibuat dengan nama **"Data Master"** (ber-spasi), tetapi keempat dropdown validasi (Kode Role, Biro, Divisi, Penempatan) merujuk `DataMaster!$A$2…` (tanpa spasi) — nama tersebut tidak cocok dengan sheet mana pun, sehingga Excel mengartikannya sebagai **referensi workbook eksternal** yang tidak ditemukan. Perbaikan: sheet tersembunyi dinamai **"DataMaster"** supaya formula dropdown resolve ke sheet internal yang sama; tidak ada lagi workbook link di file (dropdown tetap berfungsi dari data master terkini di server).

### Pembuktian (bukan klaim)
- Gate: api tsc+eslint bersih + test **89/89** (test template ditambah asersi regresi: setiap formula dropdown harus merujuk sheet bernama `DataMaster` **dan sheet itu ada** di workbook).
- Template hasil unduhan dari API dev diperiksa langsung di XML-nya: workbook berisi sheet `Petunjuk` (visible), `DataMaster` (**hidden**), `Pengguna` (visible); keempat grup formula validasi = `DataMaster!$A$2:$A$5`, `$C$2:$C$4`, `$D$2:$D$4`, `$E$2:$E$2` — semuanya menunjuk sheet internal yang ada, bukan workbook eksternal.
- **Pengguna perlu mengunduh ulang template** dari aplikasi; file lama yang sudah terunduh tetap mengandung link rusak (hanya berlaku pada file tersebut — boleh langsung dihapus).

## [2026-11-22] — UAT: istilah tombol sidebar diperbaiki ("Ciutkan menu" → "Sembunyikan menu")

### Diubah
- **Label tombol ciut sidebar diganti dari "Ciutkan menu" menjadi "Sembunyikan menu"** (permintaan user: istilah "ciutkan" kurang bagus) dengan pasangan standar UI Indonesia: terbuka → **"Sembunyikan menu"**, ciut → **"Tampilkan menu"** (tooltip `title` dan teks sr-only ikut diganti). Tampilan dan perilaku tombol tidak berubah.

### Pembuktian (bukan klaim)
- Gate: web tsc+eslint bersih.
- Playwright: keadaan terbuka = label & tooltip "Sembunyikan menu"; keadaan ciut = tooltip & sr-only "Tampilkan menu"; klik lagi memulihkan label semula.

## [2026-11-22] — UAT: tombol ciutkan sidebar didesain ulang (clean & futuristik)

### Diubah
- **Tombol "« Ciutkan menu" di sidebar desktop diganti kontrol ikon-ghost minimalis**: kotak ber-border yang terlihat kaku diganti tombol polos dengan ikon chevron ganda SVG + label kecil, dipisah garis hairline dari menu di atasnya. Ikon **berputar 180° dengan transisi halus 300 ms** saat menu diciutkan (menjadi menunjuk kanan) dan kembali saat diperluas; hover memberi latar maroon lembut; saat ciut hanya ikon yang tampil (tinggi & sentuh tetap memenuhi standar `min-h-touch`) dengan tooltip "Perluas menu". Perilaku tidak berubah: `aria-pressed`, persistensi di localStorage, dan tooltip `title` tetap ada.

### Pembuktian (bukan klaim)
- Gate: web tsc+eslint bersih + test **48/48**.
- Playwright (peserta1, desktop 1280 px): keadaan terbuka — `aria-pressed=false`, label "Ciutkan menu", tooltip benar, ikon tidak diputar, tanpa kelas border kotak; setelah klik — `aria-pressed=true`, ikon berkelas `rotate-180`, sidebar menyempit menjadi 68 px; **reload halaman: keadaan ciut tetap tersimpan** (localStorage), klik lagi memulihkan keadaan terbuka. Screenshot kedua keadaan.

## [2026-11-22] — UAT: halaman Profil didesain ulang (clean, elegan, profesional)

### Diubah
- **Halaman Profil (UI/UX + tata letak) didesain ulang** tanpa mengubah fungsi maupun data (semua isian tetap dari backend, semua fitur lama tetap ada):
  - **Kartu hero identitas ber-brand KCIC**: avatar inisial (selaras dengan avatar header), nama besar, @username, chip role, dan chip status akun (Aktif hijau / nonaktif kuning) di band maroon `#8B1A1A` — menggantikan teks kecil "Masuk sebagai …".
  - **Judul seksi konsisten** (uppercase kecil abu-abu) untuk Informasi akun, Data penugasan, Jadwal kerja, Keamanan.
  - **Data penugasan jadi grid 2 kolom di layar ≥sm** (Nomor peserta/Status, Biro/Divisi, Penempatan/Periode berpasangan) dan **Pembimbing menyatu** di kartu yang sama dengan avatar inisial + email di bawah nama — sebelumnya kartu terpisah dan semua baris vertikal memanjang.
  - **Jadwal kerja**: jam ditampilkan sebagai chip (maroon lembut untuk hari kerja, abu-abu untuk Libur).
  - **Tombol aksi rata kanan di layar ≥sm** (tetap full-width di HP) dan **tombol Keluar masuk "danger zone"** berbingkai merah dengan keterangan — sebelumnya tombol merah full-width lepas tanpa konteks.
  - Status peserta kini memakai pemetaan lengkap Aktif/Selesai/Mundur (selaras dengan beranda).

### Pembuktian (bukan klaim)
- Gate: web tsc+eslint bersih + test **48/48**.
- Playwright (peserta1): hero memuat "Andi Prasetyo", inisial AP, chip "Peserta Magang" + "Aktif"; Data penugasan 6 baris + Pembimbing Budi Santoso (avatar BS + email); jadwal 7 hari berchip 09:00 – 18:00; seksi Keamanan dan danger zone Keluar ada. Regresi fungsi: submit nama kosong memunculkan validasi inline "Nama tampilan wajib diisi." **tanpa menyimpan data**.
- Playwright (admin-hr): hero chip "Admin Magang/HR", seksi penugasan/jadwal tidak tampil (sesuai data), Keamanan tetap ada.
- Tanpa scroll horizontal di 360 px maupun 390 px; screenshot mobile 360/390 px + desktop 1280 px.

## [2026-11-22] — UAT: kompresi foto bukti (frontend + backend)

### Ditambahkan
- **Foto bukti selfie kini dikompres dua lapis** (permintaan user: biar tidak makan storage, baik di frontend maupun backend):
  - **Frontend** (hemat bandwidth upload, mobile-first): frame kamera diturunkan ke sisi terpanjang **≤1280 px** (rasio asli dipertahankan, tidak memperbesar frame kecil) lalu di-encode JPEG kualitas 0.85 sebelum dikirim — berlaku otomatis untuk absen datang/pulang maupun pergerakan izin karena keduanya memakai komponen `CameraCapture` yang sama.
  - **Backend (enforcement resmi)**: `validateAndProcessImage` kini me-resize bukti ke sisi terpanjang **≤1280 px** (`fit: inside, withoutEnlargement`) sebelum re-encode JPEG **q82 mozjpeg** — sebelumnya hanya re-encode q85 tanpa resize, jadi foto ponsel 4000 px tersimpan 4000 px (1-4 MB). EXIF/metadata tetap dibuang; dimensi, ukuran, dan checksum di DB kini mencerminkan byte final hasil kompresi.
  - Batas input tidak berubah: file > `MAX_UPLOAD_BYTES` atau resolusi > 4096 px tetap ditolak; foto kecil tidak pernah diperbesar. **Tanpa dependensi baru** (`sharp` sudah menjadi dependency API).

### Pembuktian (bukan klaim)
- Gate: api tsc+eslint bersih + test **89/89** (2 test kompresi baru: 3000×2000 → tersimpan 1280×853 dan byte lebih kecil; 100×80 tidak diperbesar); web tsc+eslint bersih + test **48/48** (2 test helper `evidenceTargetSize` baru: rasio tetap, tidak memperbesar).
- E2E Playwright (peserta1, kamera fake Chromium, 640×480): absen masuk sukses; preview blob terkompresi frontend **7.6 KiB**; DB `file_objects` mencatat **640×480, 5.1 KiB** (hasil re-encode backend q82) di `peserta1/datang/…`; foto termuat di Detail Absensi (`naturalWidth > 0`, 640×480).
- Demo kompresi in-browser pada frame 3000×2000: **2006 KiB → 353 KiB (82% lebih kecil)** dengan resep yang sama (≤1280 px + q0.85).
- Artefak uji sendiri dibersihkan setelah verifikasi: baris `attendance_events`/`file_objects`/`attendance_days` peserta1 hari ini + objek MinIO terkait dihapus; sisa sampah 1.2KiB dari run test suite (10 objek) juga disapu — bucket hanya berisi 9 foto sah + `_unlinked/`.

## [2026-11-22] — UAT: bukti MinIO dipisah per kategori (datang/pulang/izin)

### Diubah
- **Folder bukti selfie kini dipisah per jenis absensi**: object key berkembang dari `{username}/{uuid}.jpg` menjadi `{username}/{kategori}/{uuid}.jpg` — kategori `datang` (absen masuk), `pulang` (absen pulang), dan `izin` (pergerakan izin; asumsi yang dicatat: foto pergerakan izin dimasukkan ke folder `izin` karena satu-satunya jalur upload foto di modul izin adalah pergerakan — kalau dianggap kurang pas, tinggal ganti satu parameter). Nama file tetap UUID acak; kategori dilewatkan sebagai tipe compile-time (`EvidenceCategory`), username tetap divalidasi saat penyusunan key. Dokumen ARCHITECTURE.md §8 dan SECURITY.md §6 ikut di-update.

### Diubah (data dev)
- Migrasi lanjutan isi bucket: **9 foto sah** dipindah dari `username/uuid.jpg` ke subfolder kategori sesuai jenis event di DB (`abhi/` datang+pulang, `bayu.pratama/`, `fajar.nugroho/`, `maya.sari/`, `peserta3/` datang+pulang, `putri.maharani/` datang+pulang) dan kolom `object_key` di-update; 30 objek sampah 1.2KiB buatan run test suite terbaru (folder peserta1/2/3 dengan subfolder baru) dihapus — artefak uji saya sendiri.

### Pembuktian (bukan klaim)
- Gate: api tsc+eslint bersih + test **87/87** (3 test unit format key di-update ke format `username/kategori/uuid.jpg`).
- Migrasi terverifikasi: listing bucket akhir menampilkan struktur `abhi/datang/… + abhi/pulang/…`, `peserta3/datang/… + peserta3/pulang/…`, dst. — tidak ada lagi foto langsung di root folder username; 9 baris `file_objects.object_key` sesuai kategori event masing-masing (7 datang, 2 pulang; foto izin belum ada di dev).
- Playwright (peserta3, detail riwayat): kedua foto bukti hari ini (datang & pulang) termuat dari folder terpisah (`naturalWidth > 0`).

## [2026-11-22] — UAT: struktur bukti MinIO per-user (folder username)

### Ditambahkan
- **Bukti selfie kini tersimpan per-user di MinIO**: object key baru `{username}/{uuid}.jpg` — foto absen/pergerakan izin masuk ke folder username intern pengirim (permintaan user; sebelumnya semua foto flat di root bucket dengan UUID acak). Nama file tetap UUID acak; bucket tetap privat dan hanya bisa dibaca lewat API yang ter-authorisasi.
- **Validasi charset username di boundary**: pembuatan user via panel kini menolak username di luar `^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$` (selaras dengan validasi import Excel) karena username dipakai sebagai nama folder; `generateObjectKey` memvalidasi ulang sebelum menyusun key (tolak slash/spasi/diawali tanda baca).

### Diubah (data dev)
- Migrasi isi bucket `attendance-evidence` di dev: **9 foto sah** (semua baris `file_objects`) dipindah ke folder username pemiliknya (`abhi/` ×2, `bayu.pratama/`, `fajar.nugroho/`, `maya.sari/`, `peserta3/` ×2, `putri.maharani/` ×2) dan kolom `object_key` di DB di-update; **294 objek yatim** (tanpa baris DB — sisa run test suite yang memakai bucket yang sama) dipindah ke folder `_unlinked/` **tanpa dihapus** (menunggu konfirmasi user apakah boleh dibersihkan); 50 objek sampah 1.2KiB buatan run test suite sendiri di folder `peserta1/2/3` dihapus (artefak uji saya sendiri).

### Pembuktian (bukan klaim)
- Gate: api tsc+eslint bersih + test **87/87** (3 test unit baru: format key `username/uuid.jpg`, bentuk username sah, tolak username tak aman; 1 test API baru: create user dengan 5 username tak aman → 400 dan user tidak tercipta).
- Upload uji dari test suite (lewat stack API penuh ke MinIO dev) membuktikan jalur baru: objek masuk `peserta1/…`, `peserta2/…`, `peserta3/…` dengan timestamp yang sama dengan run test.
- Migrasi terverifikasi: listing bucket menampilkan folder `abhi/`, `bayu.pratama/`, `fajar.nugroho/`, `maya.sari/`, `peserta3/`, `putri.maharani/` (root tidak lagi berisi objek flat kecuali `_unlinked/`); 9 baris `file_objects.object_key` di DB berformat folder; Playwright (peserta3): kedua foto bukti hari ini termuat dari key berfolder (`naturalWidth > 0`) — foto lama tetap tampil setelah migrasi.

## [2026-11-22] — UAT: beranda peserta dilengkapi (identitas lengkap + elemen kehadiran)

### Ditambahkan
- **Kartu "Data peserta" di beranda intern** — info identitas lengkap dari backend (`GET /profile`, tanpa endpoint baru): Nomor peserta, Biro, Divisi, Penempatan, Pembimbing, Periode magang (mulai s.d. selesai), dan Status peserta (Aktif/Selesai/Mundur). Konsisten dengan label di halaman Profil.
- **Kartu "Kehadiran bulan ini"** — ringkasan kehadiran bulan berjalan (rentang bulan dihitung dari tanggal bisnis server, bukan jam perangkat): tile Hadir (PRESENT + pulang-awal disetujui), Terlambat, Belum lengkap, Perlu review, plus keterangan "Dari N hari kerja terjadwal · M hari belum ada absen sama sekali" dan tombol ke Riwayat. Data dari endpoint list absensi milik sendiri (sudah ter-scope per peserta di backend), pageSize 100 (≤31 hari/bulan).
- **Elemen kehadiran hari ini makin lengkap**: baris "Toleransi terlambat" (dari snapshot jadwal) dan badge merah **Terlambat** pada jam absen masuk bila `isLate`.
- **Kartu izin aktif** kini menampilkan estimasi jam keluar/kembali (format WIB) bila ada.

### Diperbaiki
- **Backend menolak penugasan pembimbing ganda yang masih aktif** (bug data ditemukan saat UAT beranda: satu peserta tercatat punya pembimbing yang sama 9× karena POST/PATCH `/admin/assignments` belum memvalidasi pasangan peserta+pembimbing yang sudah ACTIVE — repeat klik "tambah pembimbing" diam-diam membuat baris duplikat). Kini POST maupun PATCH yang menghasilkan penugasan ACTIVE duplikat ditolak **409** dengan pesan Bahasa Indonesia. Pembacaan `/profile` juga mendedupe pembimbing per ID sehingga tampilan tetap benar meski ada baris duplikat lama (baris dev yang sudah ada tidak dihapus — menunggu konfirmasi).

### Diubah
- **Jam hidup "Waktu server" dihapus dari header beranda** (permintaan user) — sisa tampilan cukup "Halo, {nama}" + tanggal hari ini. Catatan: label "Waktu server" di layar sukses absensi, detail riwayat, dan detail izin **tetap ada** karena di sana itu bukan jam hidup melainkan **waktu resmi tercatatnya event** (bukti kehadiran menurut server), bukan keterangan kosmetik.

### Pembuktian (bukan klaim)
- Gate: api tsc+eslint bersih + test **83/83** (asersi baru: POST `/admin/assignments` duplikat → **409**, dan `/profile` tetap mengembalikan tepat 1 pembimbing); web tsc+eslint bersih + test **46/46**.
- Playwright (peserta3): header beranda kini hanya "Halo, Dewi Lestari" + "22/11/2026" — teks "Waktu server" tidak ada lagi di header, tanggal tetap tampil.
- Playwright (peserta3, read-only): beranda menampilkan MG-2026-003, Biro Operasi, Divisi Operasi & Dengkel, Depo Tegalluar, Pembimbing Budi Santoso **(1×)**, Periode magang, Status Aktif; kartu absensi memuat jadwal 09:00–18:00 WIB, toleransi 15 menit, badge Terlambat; izin aktif dengan estimasi keluar/kembali; tile kehadiran bulan ini cocok dengan SQL (`NEEDS_REVIEW=1`, "Dari 1 hari kerja terjadwal"); tanpa scroll horizontal di 390 px; screenshot 390 px & desktop 1280 px.
- Satu-satunya error console adalah `GET /auth/me` **401** saat halaman login sebelum sesi ada — perilaku bawaan yang sudah ada sebelumnya (bukan dari perubahan ini).

## [2026-11-22] — UAT: bukti selfie tidak tampil di detail absensi (bug preview)

### Diperbaiki
- **Critical (bug UAT)**: kotak bukti selfie di Detail Absensi menampilkan gambar rusak (alt text saja). Akar masalah: endpoint bukti mengembalikan **presigned URL MinIO dengan hostname internal Docker** (`http://minio:9000/...`) — browser pengguna tidak bisa menyelesaikan hostname tersebut, jadi `<img>` gagal memuat (API-nya sendiri sukses). Perbaikan: API kini **men-streaming langsung isi gambar** dari MinIO (endpoint sama, tetap ter-authorisasi via sesi + audit `EVIDENCE_ACCESS`, `Cache-Control: private`), dan komponen `EvidenceImage` me-render `<img src="/api/v1/attendance/{id}/evidence?eventId=…">` same-origin — cookie sesi otomatis terkirim, bucket MinIO tetap tertutup, tidak ada dependensi/konfigurasi baru. Berlaku untuk mode sendiri maupun monitoring admin/pembimbing.

### Pembuktian (bukan klaim)
- Gate: api tsc+eslint bersih + test **83/83** (test evidence diubah: streaming image → 200 `image/*` dengan payload >0; peserta lain tetap 404 tanpa data leak); web tsc+eslint bersih + test **46/46**.
- Playwright (peserta3, detail riwayat hari ini): 2 gambar "Bukti selfie" termuat semua (`naturalWidth > 0`); respons `/evidence?eventId=…` **200 image/jpeg** via path API yang sama; screenshot pembuktian. Skenario read-only tanpa menulis data uji.

## [2026-11-22] — UAT: alamat terperinci di lokasi tercatat (reverse-geocoding)

### Ditambahkan
- **Koordinat kini diterjemahkan menjadi alamat terperinci** (prinsip "tercatat di mana" yang bisa dibaca, bukan sekadar angka): backend memanggil Nominatim (OpenStreetMap, gratis tanpa API key) best-effort saat absen/pergerakan izin dikirim dan **menyimpan hasilnya bersama event** (`address` baru di `attendance_events` & `leave_events` — migrasi `20261122130000_event_address`, nullable, rollback tercatat di komentarnya). Alamat beku saat kejadian, jadi bukti tidak berubah menurut waktu pembacaan.
- Endpoint `GET /geocode/reverse?latitude=&longitude=` untuk panel Status lokasi; helper geocoding punya cache (bulat 4 desimal ≈ 11 m), timeout 5 detik, dan **tidak pernah menggagalkan absen** — bila layanan geocoding mati/offline, event tetap sah tanpa alamat (kolom NULL). Toggle `GEOCODE_ENABLED` (default aktif; otomatis nonaktif di test suite).
- Tampilan alamat di semua titik lokasi: panel Status lokasi ("Alamat terperinci (© OpenStreetMap): …"), layar sukses absensi (baris Alamat dari respons submit), timeline detail riwayat & detail izin ("Alamat: …"), dan dashboard peserta. Tanpa dependensi baru.

### Pembuktian (bukan klaim)
- Gate: api tsc+eslint bersih + test **83/83** (4 test baru: helper sukses+cache, jaringan gagal → null, respons 403 → null, display_name kosong → null; test suite utama membuktikan absen tanpa geocoding tetap jalan dengan `address` null); web tsc+eslint bersih + test **46/46**.
- Migrasi terverifikasi di DB dev (`information_schema`: kolom `address` nullable di kedua tabel).
- Playwright end-to-end (peserta1, geolocation uji -6.9147/107.6098): panel Status lokasi memuat "Alamat terperinci (© OpenStreetMap): …"; absen masuk sukses dan layar sukses menampilkan "Alamat: Perpustakaan Bank Indonesia, Jalan Merdeka, Babakan Ciamis, Sumur Bandung, Kota Bandung, Jawa Barat, 40111, Indonesia"; detail riwayat menampilkan alamat pada timeline event; screenshot 390 px aman. DB membuktikan baris `CHECK_IN` tersimpan dengan `address` tersebut; objek bukti MinIO + baris DB uji sendiri dihapus setelahnya.

## [2026-11-22] — UAT lanjutan: peringatan akurasi dihapus + koordinat bisa dilihat di Google Maps

### Diperbaiki
- **Nag akurasi 25 m dihapus** — sebelumnya setiap lokasi dengan akurasi >25 m (khas laptop/WiFi, biasanya ±100–200 m) memunculkan peringatan kuning "disarankan berpindah ke area terbuka". Bertentangan dengan kebijakan "bebas absen di mana saja": lokasi murni bukti, akurasi dicatat apa adanya. State `low_accuracy` dihapus dari state machine lokasi; pesan siap kini netral: "Lokasi tercatat. Akurasi ±X m — akurasi tergantung perangkat dan tidak membatasi absensi."
- **Klarifikasi prompt izin lokasi** (bukan bug): dialog persetujuan lokasi adalah perilaku bawaan browser dan hanya muncul sekali per situs. Bila koordinat berhasil didapat (mis. ±143 m), artinya izin sudah pernah disetujui di sesi sebelumnya. Jika sebelumnya ditolak, reset lewat ikon di bilah alamat browser — UI panel "Status lokasi" sudah menuntun hal ini.

### Ditambahkan
- **Link "Lihat di Google Maps"** di semua titik lokasi tercatat: layar sukses absensi, detail riwayat (timeline event), detail izin (timeline pergerakan), dan kartu "Lokasi terakhir tercatat" di dashboard peserta — koordinat kini bisa diverifikasi visual, bukan hanya angka. Tanpa dependensi baru (anchor ke `google.com/maps?q=lat,lng`).

### Pembuktian (bukan klaim)
- Gate: web tsc + eslint bersih, test **46/46** (API tidak berubah).
- Playwright: geolocation uji akurasi 143 m → panel menampilkan pesan netral "±143", teks "area terbuka" hilang; dashboard peserta menampilkan link maps dengan href `google.com/maps?q=-6.9147,107.6098`; detail riwayat menampilkan 2 link maps pada timeline event. Semua skenario read-only tanpa menulis data uji.

## [2026-11-22] — UAT: lokasi absensi opsional — absen dari mana saja, koordinat tercatat bila tersedia

### Diperbaiki
- **Critical (bug UAT role intern)**: absensi diblokir ketika izin lokasi/GPS tidak tersedia — tiga lapis pintu: (1) halaman Absensi hanya membuka panel konfirmasi bila ada foto **dan** lokasi, (2) halaman detail izin menahan tombol kirim pergerakan tanpa lokasi, (3) backend menolak 400 bila koordinat tidak dikirim dan kolom `latitude/longitude` DB tidak menerima NULL. Kini lokasi **bukan syarat absen**: prinsip "bebas di mana saja, yang penting tercatat di mana" (seperti timestamp). Koordinat dicatat sebagai bukti bila perangkat menyediakan; bila GPS/izin lokasi tidak ada, event tetap sah tersimpan tanpa koordinat dan UI memberitahu "Lokasi tidak tercatat". Berlaku untuk absen masuk/keluar **dan** pergerakan izin (keluar/kembali/pulang lebih awal).
- Migrasi `20261122120000_location_optional`: `attendance_events.latitude/longitude` dan `leave_events.latitude/longitude` menjadi nullable (DROP NOT NULL — tanpa penulisan ulang data; rollback: SET NOT NULL setelah memastikan tidak ada NULL, tercatat di komentar migrasi).
- `parseCoords` backend: koordinat boleh absen (null); nilai non-numerik tetap ditolak 400 dengan pesan per-field berbahasa Indonesia. Validasi rentang (lat ±90, lng ±180) tetap berjalan untuk nilai yang dikirim.
- Frontend: panel konfirmasi absensi muncul dengan foto saja; peringatan kuning "koordinat tidak ikut terkirim, absensi tetap dapat dikirim"; layar sukses & timeline detail menampilkan "Lokasi tidak tercatat" bila null; dashboard peserta "Lokasi terakhir tercatat" kini benar-benar membaca koordinat (bukan akurasi).

### Pembuktian (bukan klaim)
- Gate: api tsc+eslint bersih + test **79/79** (termasuk regresi baru: check-in/check-out tanpa koordinat → 201 dengan lat/lng NULL di DB, pergerakan izin tanpa koordinat → 201, koordinat non-numerik → 400); web tsc+eslint bersih + test **46/46**.
- Browser (Playwright): skenario tanpa GPS — check-in sukses, layar sukses menampilkan "Lokasi tidak tercatat (izin/GPS tidak tersedia)"; skenario GPS aktif — check-out sukses dengan "Lokasi tercatat (±12 m)"; DB membuktikan `CHECK_IN | NULL | NULL | NULL` vs `CHECK_OUT | -6.9147 | 107.6098 | 12`. Panel konfirmasi 390px rapi + peringatan kuning tampil.
- Data uji sendiri dibersihkan (baris DB + objek bukti MinIO dihapus).

## [2026-11-22] — UAT: fix jadwal INDIVIDUAL tidak berlaku (bug selfie abhi)

### Diperbaiki
- **Critical (bug UAT)**: jadwal dengan scope INDIVIDUAL tidak pernah berlaku ke peserta — combobox "Objek scope" mengisi **ID user**, padahal pencocokan jadwal di backend memakai **ID profil peserta** (`intern_profiles.id`), sehingga jadwal yang dibuat admin tidak pernah cocok dan peserta jatuh ke jadwal GLOBAL (Minggu libur → tombol absen mati). Combobox kini mengambil opsi dari daftar profil peserta (nama tampilan + nomor peserta), label scope diperjelas "Peserta (individu)", dan backend kini memvalidasi keberadaan scopeId saat create (422 berbahasa Indonesia jika biro/divisi/profil tidak ditemukan). Data jadwal milik pengguna di dev diperbaiki via SQL (scope_id diarahkan ke profil peserta) dan snapshot harian beku miliknya dihapus agar ter-regenerasi.

### Pembuktian (bukan klaim)
- Browser (admin): Tambah Jadwal → scope INDIVIDUAL menampilkan profil peserta ("abi 08129333", "Putri Maharani MG-2026-104", …); buat jadwal uji via UI → DB memastikan `scope_id` adalah `intern_profiles.id` (bukan `users.id`); baris uji dihapus setelahnya.
- Gate: api test **76/76** (termasuk regresi baru: scopeId INDIVIDUAL yang bukan profil peserta ditolak 422), web test **46/46**.

## [2026-11-22] — UAT: fix layar abu-abu tab Kalender + tab Parameter tanpa JSON

### Ditambahkan
- **Swagger UI aktif** di `http://localhost:3002/api/v1/docs` (spec JSON di `/api/v1/docs/json`) — paket `@fastify/swagger-ui` sudah ter-install sejak baseline, kini diregistrasi; rute `/docs/json` manual digantikan otomatis oleh plugin. Terbukti render 110 endpoint tanpa error console.

### Diperbaiki
- **Critical (bug UAT)**: buka tab Kalender di Data Master membuat seluruh aplikasi blank (layar abu-abu) — `GET /admin/calendar` mengembalikan `{items}` tanpa objek `pagination`, sedangkan panel generik selalu merender paginasi (destructure `undefined` → crash React tanpa error boundary). Kontrak list kini diselaraskan dengan resource master lain: query `page/pageSize` + filter tanggal tetap, respons `{items, pagination}`. 2 test regresi baru (API 75/75).
- Sidebar kini mentok kiri di layar lebar (kerangka `max-w-7xl mx-auto` dilepas; header full-width agar logo sejajar) — terbukti 1920/1280/390 px.

### Ditambahkan
- **Tab Parameter tanpa JSON**: panel khusus `ParametersPanel` — editor menyesuaikan bentuk nilai (angka → kotak angka; daftar hari 0–6 → 7 checkbox Senin–Minggu; teks → kotak teks; bentuk tak dikenal → fallback JSON untuk IT). Kolom Nilai ditampilkan manusiawi ("Senin, Selasa, …") + kolom status kebijakan ("Menunggu konfirmasi KCIC"). Key tidak bisa diedit; key lain di `valueJson` (mis. `status`) tetap dipertahankan saat simpan.
- **Tombol "Tambah Parameter" dihapus dari UI** — key parameter dieksekusi kode backend, pembuatan key baru tetap lewat seed/migrasi oleh IT (API POST tetap ada untuk IT).

### Pembuktian (bukan klaim)
- Browser: tab Kalender render + buat libur "Hari Raya Natal" 2026-12-25 via UI → tersimpan & tampil; Parameter: toleransi 15→20 via kotak angka tersimpan, checkbox Senin–Jumat + tambah Sabtu tersimpan, lalu nilai usulan (15, Sen–Jum) dikembalikan via PATCH ber-audit; 390 px aman; 0 pageerror.
- Gate: api tsc+eslint+test **75/75**, web tsc+eslint+test **46/46**.

## [2026-11-22] — Fase 6: verifikasi berbukti akhir + laporan akhir

### Ditambahkan
- `docs/LAPORAN_AKHIR.md` — ringkasan per fase (commit `25300ad`…`85f1ebc`), file yang berubah, matriks CRUD per role, asumsi/keputusan ambigu, bukti gate & E2E, item belum selesai + alasan, saran lanjutan, cara verifikasi ulang.

### Pembuktian (bukan klaim)
- Gate akhir (15:25 WIB): api tsc + eslint + test **73/73**; web tsc + eslint + test **42/42**.
- E2E ulang seluruh suite: pohon permission **25/25**, RBAC per role **0 gagal** (42 langkah), profil **28/28**, feedback error **7/7**, pagination/konsol **15/15**.
- Pembersihan data uji sendiri: 16 biro scratch `QA-F6-*` dihapus (DELETE 16), SUPERVISOR kembali tepat 7 permission (diverifikasi SQL), nama jadwal sisa uji dirapikan.
- Catatan jujur: `POST /auth/login` memang tidak memeriksa Origin (belum ada sesi/cookie); Origin+CSRF tetap ketat pada semua mutasi ber-sesi. Login-CSRF dicatat sebagai saran lanjutan, bukan bug baru.

### Diperbaiki
- **Sidebar tidak mentok kiri di layar lebar**: kerangka layout `max-w-7xl mx-auto` membuat menu terapung di tengah (ruang kosong di kiri pada laptop/monitor lebar). Sidebar kini menempel ke tepi kiri, header full-width agar logo sejajar dengan menu; konten halaman tetap di tengah container masing-masing. Terbukti di 1920/1280/390 px + collapse tetap berfungsi.

## [2026-11-22] — Fase 0–5: perbaikan bug, RBAC penuh, profil lengkap, feedback error (branch `feat/uji-manual-integrasi`)

### Diperbaiki
- **Origin/CSRF**: akses dari `127.0.0.1:5174` tidak lagi ditolak; fokus input pertama yang hanya menerima 1 karakter diperbaiki.
- **Navigasi**: sidebar bisa diciutkan di desktop; drawer hamburger di ponsel; header dirapikan; tema KCIC `#8B1A1A` lewat design tokens (bukan warna hardcode).
- **Pesan sukses yang lenyap** pada halaman Role & Permission (invalidasi query menimpa state) — reset status kini hanya saat berganti role.
- **Kotak pesan hijau untuk error** di halaman Profil — sukses/gagal kini dipisah (hijau/merah, `role="alert"`).

### Ditambahkan
- **Dashboard admin/pembimbing**: filter biro/divisi/tanggal dijalankan di backend + grafik SVG tanpa library baru.
- **Kolom Aksi + pagination server-side** di Monitoring, Approval, dan Laporan; combobox searchable untuk dropdown master.
- **Role CRUD** (Data Master → tab Role) + penggabungan menu Peserta ke Pengguna + hapus menu Penugasan.
- **Import Excel pengguna**: template xlsx dinamis (dropdown biro/divisi/penempatan/role dari DB), validate → confirm, error per baris, `mustChangePassword`.
- **Menu 'Pengguna & Hak Akses'**: pohon permission 7 menu → submenu → fitur/aksi (expand/collapse, indeterminate, cari, pilih semua) + template sekali klik Administrator/Pembimbing/Peserta (tersimpan di backend, `permission-taxonomy.ts`).
- **RBAC penuh di frontend**: menu dari permission efektif, guard rute redirect ke Beranda, tombol aksi disembunyikan tanpa permission (ekspor laporan, unduh CSV, aksi izin pemilik, tab Akses), backend tetap titik keputusan.
- **Profil lengkap**: `GET /profile` memuat role, penugasan (nomor peserta, biro/divisi/penempatan, periode), pembimbing aktif, dan jadwal kerja aktif (resolusi INDIVIDUAL > DIVISION > BUREAU > GLOBAL). `PATCH /profile` strict whitelist nama/email/telepon (field lain ditolak 400, email duplikat 409, telepon format Indonesia).
- **Feedback error ramah**: seluruh error validasi API kini envelope `VALIDATION_ERROR` Bahasa Indonesia + `fieldErrors` per-field (pesan default zod diterjemahkan); jaring pengaman Prisma `P2002`/`P2003`/`P2025` → 409/409/404 ramah; panel menampilkan pesan field pertama dari backend.

### Diubah
- Validasi telepon format Indonesia dipakai seragam di profil, admin user create/patch, dan import Excel (`phoneIdSchema`).
- Tombol Hapus role disembunyikan untuk role sistem/berpengguna; API tetap menolak (hapus relasi aman).

### Pembuktian (bukan klaim)
- `pnpm --filter api test` **73/73**, `pnpm --filter web test` **42/42**, tsc+eslint kedua app hijau.
- E2E Playwright: Fase 1.6 **25/25**, Fase 2 **42/42** (termasuk pencabutan permission live → menu/tombol berubah), Fase 3 **28/28** (profil lengkap, edit kontak, validasi per-field, header sinkron, 390px), Fase 4 **7/7** (error per-field dialog, role create+delete, mobile 390px). Screenshot di `ux-audit/`.

### Dokumentasi
- `docs/RBAC.md` (pohon permission + template + guard), `docs/ADMIN_GUIDE.md` (panduan singkat admin + cara import Excel), README (fitur per role + tautan docs), `docs/DATA_FLOW.md` (kontrak profil baru, import Excel, konvensi error), `docs/USER_GUIDE.md` (Profil & Admin diperbarui).

## [2026-11-22] — Fase A5: Dokumentasi integritas data

### Ditambahkan
- `docs/DATA_FLOW.md` — peta halaman → API → tabel DB per role, rantai data (snapshot, bukti, izin, laporan), daftar pengaturan yang bisa diubah tanpa deploy, konstanta frontend yang sah beserta alasannya, endpoint yang belum dipakai UI, dan cara verifikasi mandiri.
- README: tabel lengkap variabel environment (wajib/opsional + default), instruksi migrate & seed manual vs otomatis (api-migrate), tautan DATA_FLOW.
- `.env.example`: opsi `SESSION_TTL_HOURS`, `MAX_UPLOAD_BYTES`, `SIGNED_URL_TTL_SECONDS`, `BUSINESS_TIMEZONE`, `API_PROXY_TARGET` (default dikomentari).
- `API_CONTRACT.md`: filter `GET /attendance` (bureauId/divisionId/search), validasi ISO `clientSubmittedAt` → 400, `GET /admin/schedules/form-defaults` + `GET /admin/schedules/:id`, `PATCH /admin/business-parameters/:id`, `GET /admin/access/roles/:id`.
- Keputusan D-030 (penyelarasan kontrak form Master) dan D-031 (error state boot + deadline fetch + timeout koneksi nginx) di `DECISIONS.md`; entri BUILD_LOG Fase A1–A5.

### Diubah
- `docker-compose.yml`: `TZ` container api/api-migrate kini `${BUSINESS_TIMEZONE:-Asia/Jakarta}` (sebelumnya literal).

## [2026-11-22] — Fase A4: Pembuktian E2E integritas data + perbaikan celah (commit `974f9b0`)

### Diperbaiki
- **Critical**: 8 form Data Master (Biro, Divisi, Penempatan, Peserta, Penugasan, Cakupan, Kalender, Kategori Izin) mengirim field yang tidak sesuai kontrak API (mis. `isActive` vs `status`, `date` vs `calendarDate`, `fullName` yang tidak ada, FK wajib hilang) → create selalu 400. `master/config.ts` ditulis ulang selaras schema zod server + 14 test unit baru (`config.test.ts`).
- Toggle aktif/nonaktif ResourcePanel kini mengirim `{status: ACTIVE|INACTIVE}` (sebelumnya boolean `isActive` yang diabaikan server).
- Catatan keputusan izin tidak tampil di peserta: web membaca `approvalNote`, API mengembalikan `decisionNote` → types + LeaveDetailPage diperbaiki ("Catatan keputusan:").
- **Backend mati = UI menggantung abadi**: nginx meng-cache IP upstream saat start sehingga koneksi ke container berhenti menggantung ~60 dtk, dan fetch tanpa deadline. Fix: `proxy_connect_timeout 5s` (nginx), deadline fetch 15 dtk GET / 60 dtk mutasi + CSRF 10 dtk (`lib/api.ts`), `bootError` di auth provider + ErrorState "Coba lagi" di RequireAuth (401 tetap redirect login; error jaringan tidak dianggap logout).

### Pembuktian (bukan klaim)
- **24/24 langkah browser** (Playwright, mobile 390 + desktop): buat peserta baru via UI → profil → jadwal INDIVIDUAL toleransi kosong → check-in foto+GPS → snapshot DB memakai toleransi parameter (20) → riwayat → izin PENDING → admin tolak ber-catatan → catatan terlihat di peserta & DB; ubah parameter via UI 15→20, ubah langsung DB →30 tampil di UI, kembalikan 15; rename display_name langsung di DB → tampil di Monitoring; stop API → ErrorState ≤25 dtk tanpa data palsu → start → retry pulih.
- **12/12 uji keamanan live**: peserta akses /admin/users & /admin/audit → 403; sid palsu → 401; POST tanpa CSRF → 403; password salah → 401 generik; `clientSubmittedAt=2020-01-01` diabaikan (occurredAtServer = hari ini); double check-in → 409; accuracy 0 → 400; Origin asing → 403 dan parameter tidak berubah.
- `pnpm --filter api test` 46/46, `pnpm --filter web test` 38/38, lint kedua app hijau, doctor PASS, scan ulang hardcode bersih.

### Diketahui / belum
- Artefak dummy uji dibiarkan (tidak ada data dihapus tanpa konfirmasi): 4 akun `peserta-uji-*` beserta profil/absensi hari ini, 1 izin REJECTED + 1 early-checkout NEEDS_REVIEW, 5 jadwal uji "Uji Dinamis" INACTIVE (PATCH ber-audit). Parameter toleransi dikembalikan ke usulan 15 (`PENDING_KCIC_CONFIRMATION`).

## [2026-11-22] — Fase A3: Integritas data — hapus hardcode kebijakan (commit `eaedfbc`)

### Diperbaiki
- **P1**: toleransi telat default diliteral `15` di backend, mengabaikan `business_parameters.late_tolerance_default_minutes` yang sudah di-seed. Kini dibaca dari parameter via `common/params.ts` (snapshot baru saja yang terpengaruh; riwayat immutable).
- **P1**: compose menjalankan seed dummy tanpa syarat. Kini seed hanya jalan bila `SEED_DEV_DATA=true` (ditolak di production).
- Form Jadwal tidak lagi menyalin angka default hardcode (08:00/17:00/15): endpoint baru `GET /admin/schedules/form-defaults` menurunkan default dari parameter (`default_workdays` + toleransi); enum scope `PLACEMENT` yang tidak dikenal backend diganti `INDIVIDUAL`.
- Tab Parameter sebelumnya mengirim field `value` palsu ke PATCH yang tidak ada → kini render `valueJson` + `PATCH /admin/business-parameters/:id` (ber-audit, key eksekusi ditolak).
- Filter Monitoring (biro/divisi/pencarian) tidak berfungsi karena `GET /attendance` tidak menerima parameternya → filter `bureauId`, `divisionId`, `search` ditambahkan (tervalidasi + ter-scope).
- Detail role di panel Akses 404: `GET /admin/access/roles/:id` ditambahkan.
- `clientSubmittedAt` invalid kini 400 (bukan 500); pergerakan izin memvalidasi akurasi lokasi sama seperti absensi.
- Dashboard admin: tanpa snapshot, "terjadwal" dihitung via resolveWorkday (tidak mengasumsikan semua peserta aktif terjadwal).
- LeavesPage pembimbing/admin memakai scope `all` (sebelumnya `scoped` → 400).
- Fallback palsu diganti state jujur: toleransi `-` bila tak tercatat, metrik laporan `-`, badge status netral bila `dayStatus` hilang.

### Ditambahkan
- Env `BUSINESS_TIMEZONE` (default Asia/Jakarta) benar-benar dipakai `common/time.ts`; `API_PROXY_TARGET` untuk proxy vite dev; Origin dev localhost:5173 hanya diizinkan saat NODE_ENV dev/test.
- SchedulesPanel/ResourcePanel/config Master membaca bentuk respons server yang benar (objek bersarang, tanggal ISO, status string).
- 8 test baru (API 46, web 24): parameter dinamis, form-defaults, clientSubmittedAt invalid, akurasi pergerakan, detail role, PATCH parameter, scope=all, filter monitoring.

## [2026-11-22] — Fase 6: Perbaikan alur inti hasil uji browser (commit `18a20a6`)

### Diperbaiki
- **Critical**: mutasi pertama setelah login selalu gagal 403 "Token CSRF tidak valid" — klien menyimpan token CSRF lama di memori padahal server merotasi cookie saat login/ganti password. Klien kini membaca cookie `csrf_token` sebagai sumber kebenaran (pola double-submit kanonik; ikut memperbaiki staleness antar-tab).
- **Critical**: riwayat pribadi peserta dan ekspor CSV pribadi selalu 0 baris — filter scope pribadi memakai `id` baris hari alih-alih `internProfileId`. Kini riwayat dan CSV berisi data milik sendiri.
- **Critical**: form pengajuan izin peserta selalu gagal memuat kategori (403) karena memanggil endpoint admin `/admin/leave-categories`. Endpoint baru `GET /leaves/categories` (kategori ACTIVE, permission `leave:request`) dipakai form; peserta kini bisa mengajukan izin dari UI.
- `infra/scripts/doctor.sh` probing port hardcoded lama (3000/5173/5432/9000/9001) → FAIL palsu dan salah mendeteksi stack lain sebagai milik proyek. Kini membaca port host dari `.env` (default selaras docker-compose.yml); hasil akhir Doctor: PASS.

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