# CHANGELOG — Presensi Magang KCIC

Semua perubahan penting proyek ini dicatat di sini. Format mengikuti semangat
[Keep a Changelog](https://keepachangelog.com/id/1.0.0/); tanggal memakai zona waktu proyek (WIB).
Aplikasi ini hanya untuk lingkungan lokal/development dengan data dummy.

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