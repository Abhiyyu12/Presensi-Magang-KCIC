# PRD — Presensi Magang KCIC

| Metadata | Nilai |
|---|---|
| Produk | Presensi Magang KCIC |
| Versi | 4.0 — Baseline pembangunan dari nol |
| Status | Draft implementasi MVP; bukan kebijakan resmi PT KCIC |
| Platform | Web responsif, mobile-first |
| Environment awal | Docker Compose, lokal saja |
| Zona waktu bisnis | Asia/Jakarta (WIB) |
| Dokumen teknis | `ARCHITECTURE.md`, `DATA_MODEL.md`, `API_CONTRACT.md`, `SECURITY.md`, `TESTING.md` |

> Aturan yang berstatus **PENDING CONFIRMATION** boleh diimplementasikan sebagai konfigurasi development yang dapat diubah, tetapi tidak boleh dipresentasikan sebagai kebijakan resmi KCIC.

## 1. Tujuan produk

Menggantikan absensi manual melalui grup WhatsApp dengan aplikasi terpusat untuk peserta magang, pembimbing, Admin Magang/HR, dan Administrator IT. Peserta melakukan check-in dan check-out dengan selfie langsung dari kamera, lokasi saat event, dan waktu server. Sistem menyediakan pengajuan izin tengah hari, riwayat, monitoring, laporan, Data Master, kontrol akses, audit trail, dan Pusat Bantuan.

## 2. Prinsip produk yang tidak boleh dilanggar

1. Waktu resmi berasal dari server; simpan UTC dan tampilkan WIB.
2. Selfie absensi diambil langsung dari kamera pada alur normal; tidak ada upload galeri.
3. Lokasi dicatat saat event sebagai bukti; tidak menggunakan geofence/radius.
4. Tidak ada pelacakan lokasi terus-menerus.
5. Check-in dan check-out wajib; tidak boleh membuat waktu pulang fiktif.
6. Tidak boleh ada duplikasi event untuk operasi yang sama.
7. Semua akses data sensitif diperiksa di backend.
8. Data historis tidak ikut terhapus ketika akun peserta dinonaktifkan.
9. Koreksi mempertahankan nilai asli dan mencatat audit before/after.
10. Sistem tidak mengklaim mampu mendeteksi GPS spoofing, deepfake, atau memastikan identitas wajah secara otomatis.

## 3. Pengguna dan peran default

### 3.1 Peserta Magang
- Melihat dashboard dan jadwal sendiri.
- Check-in/check-out sendiri.
- Mengajukan izin tengah hari.
- Mencatat keluar/kembali/pulang lebih awal setelah izin disetujui.
- Melihat riwayat, bukti, lokasi, dan timeline milik sendiri.
- Membaca Pusat Bantuan.
- Tidak dapat membaca data peserta lain, menyetujui izin sendiri, atau melakukan koreksi.

### 3.2 Pembimbing/Supervisor
- Melihat peserta dalam relasi penugasan aktif dan cakupan yang diizinkan.
- Melihat monitoring, riwayat, timeline, report, statistik, dan izin sesuai permission.
- Ekspor hanya sesuai cakupan.
- Default read-only; approval dan koreksi tidak diberikan otomatis.

### 3.3 Admin Magang/HR
- Mengelola peserta, akun operasional, organisasi, penempatan, dan jadwal sesuai scope.
- Memproses approval izin.
- Melakukan koreksi dengan alasan dan audit.
- Mengelola report, Data Master operasional, Pusat Bantuan, dan audit sesuai permission.

### 3.4 Administrator IT
- Mengelola role, permission, feature tree, policy ABAC/ReBAC, dan konfigurasi teknis.
- Akses operasional tambahan harus diberikan eksplisit.
- Akses superuser untuk bootstrap/testing hanya tersedia di development dan harus dinonaktifkan sebelum lingkungan non-development.

## 4. Scope MVP

### Termasuk
- Login username/password; tidak ada registrasi publik.
- Pengelolaan akun dan status aktif/nonaktif.
- Struktur biro/divisi dan penempatan.
- Jadwal global, biro, divisi, dan individu.
- Kalender hari kerja/libur/pengecualian.
- Check-in dan check-out dengan selfie kamera, GPS, dan waktu server.
- Izin sementara (keluar dan kembali) serta pulang lebih awal.
- Approval/penolakan izin.
- Riwayat dan timeline.
- Monitoring, report, statistik, CSV/XLSX export.
- Data Master terkontrol.
- RBAC + ABAC + ReBAC dan feature tree.
- Audit trail.
- Pusat Bantuan.
- Dashboard dan badge daftar pending.
- Docker Compose lokal, PostgreSQL, MinIO.

### Tidak termasuk
- Native Android/iOS.
- Payroll, penilaian magang.
- Face recognition, liveness, deepfake detection.
- Geofence, continuous tracking.
- Offline attendance.
- Shift lintas tengah malam dan lembur.
- Cuti penuh hari/sakit/cuti panjang pada MVP.
- Push/email/WhatsApp otomatis.
- HRIS/SSO eksternal.
- Workflow/rule engine bebas yang mengeksekusi kode dari UI.
- Deployment produksi dalam tahap awal.

## 5. Keputusan bisnis baseline

| Topik | Baseline implementasi | Status |
|---|---|---|
| Login | Username + password | MVP |
| Username | Unik, immutable setelah akun aktif kecuali prosedur admin khusus | Konfirmasi format final |
| Nomor ID | Atribut peserta, bukan primary key atau satu-satunya login identifier | MVP |
| Zona waktu | Simpan UTC; tampil WIB / `Asia/Jakarta` | MVP |
| Hari kerja | Senin–Jumat | Usulan, dapat dikonfigurasi |
| Toleransi terlambat | 15 menit | Usulan, dapat dikonfigurasi |
| Jam kerja | Harus diisi dari konfigurasi jadwal; jangan hardcode ke business logic | PENDING |
| Jadwal prioritas | Individu > divisi > biro > global | Baseline |
| Akhir pekan | Hanya jika jadwal khusus aktif | Baseline |
| Geofence | Tidak ada | MVP |
| Lokasi gagal | Absensi normal gagal; arahkan retry atau hubungi admin untuk prosedur koreksi ber-audit | Baseline |
| Kamera gagal | Absensi normal gagal; tidak ada upload galeri sebagai bypass | Baseline |
| Check-in/out | Maksimal satu masing-masing per hari kerja terjadwal | Baseline |
| Terlambat | Tetap dicatat dan ditandai terlambat | Baseline |
| Pulang awal tanpa izin | Tetap catat event, tandai perlu review | Baseline |
| Lupa check-out | `INCOMPLETE` / `NEEDS_REVIEW`; jangan membuat jam pulang | Baseline |
| Approval izin | Admin/role yang memiliki permission | Baseline |
| Pembimbing approver | Tidak secara default | PENDING jika ingin diubah |
| Akun selesai magang | Nonaktif; histori tetap tersimpan | Baseline |
| Retensi | Histori dipertahankan selama MVP lokal; durasi produksi perlu keputusan data owner/privacy/legal | PENDING |
| Notifikasi | Badge dan daftar pending di aplikasi | MVP |
| File storage | MinIO private bucket lokal | MVP |
| Admin IT superuser | Hanya bootstrap/test lokal; tidak menjadi akses produksi otomatis | Security constraint |

## 6. Jadwal dan perhitungan keterlambatan

- Jadwal dapat ditetapkan pada tingkat global, biro, divisi, atau individu.
- Resolusi jadwal: individu, lalu divisi, lalu biro, lalu global.
- Harus ada mekanisme mendeteksi konflik jadwal pada tingkat dan effective date yang sama.
- Setiap jadwal memiliki tanggal berlaku, hari aktif, jam mulai, jam selesai, toleransi, status aktif.
- Kalender dapat menandai hari libur dan hari kerja khusus.
- Perubahan jadwal tidak boleh mengubah hasil historis secara diam-diam. Simpan snapshot aturan yang dipakai pada event/hari kerja atau simpan referensi versi aturan.
- Perhitungan terlambat dilakukan backend berdasarkan waktu check-in server dan snapshot jam mulai + toleransi.

**PENDING CONFIRMATION:** jam resmi, toleransi final, sumber hari libur, aturan khusus per biro/divisi, kebutuhan shift lintas tengah malam.

## 7. Absensi

### Check-in
1. Peserta login.
2. Dashboard menunjukkan jadwal dan status hari ini.
3. Peserta memilih Check-in.
4. Browser meminta kamera dan lokasi.
5. Peserta melihat preview kamera dan mengambil selfie.
6. Browser memperoleh koordinat dan akurasi.
7. UI menampilkan ringkasan dan meminta konfirmasi.
8. Client mengirim event, file, koordinat, akurasi, dan idempotency key.
9. Backend memvalidasi akun, jadwal, urutan, file, lokasi, dan duplikasi.
10. Backend menyimpan file ke MinIO dan event/metadata ke PostgreSQL dengan pola konsistensi yang aman.
11. Sukses hanya ditampilkan setelah backend mengonfirmasi commit.

### Check-out
- Hanya dapat dilakukan setelah check-in sukses.
- Menggunakan selfie, lokasi, dan waktu server.
- Jika sebelum jam selesai dan tidak ada izin, tetap catat dan beri status/flag perlu review.
- Jika sudah pulang lebih awal dengan izin approved, event check-out menutup hari sebagai pulang lebih awal berizin.
- Jika ada izin sementara yang belum kembali, check-out normal tidak boleh menutup izin diam-diam; perlu alur review yang ditentukan.

### Validasi
- Waktu client dan EXIF bukan sumber waktu resmi.
- Koordinat manual tidak diterima dari UI normal.
- Tidak ada geofence.
- Idempotency key di-scope ke actor dan operasi.
- Unique constraint/transaction menjadi pertahanan terakhir anti-duplikasi.

## 8. Izin tengah hari

Jenis MVP:
1. **Izin sementara — akan kembali.**
2. **Pulang lebih awal — tidak kembali.**

Aturan:
- Pengajuan hanya setelah check-in.
- Kategori berasal dari Data Master.
- Alasan teks wajib.
- Estimasi waktu keluar wajib; estimasi kembali wajib untuk izin sementara.
- Approval oleh role berizin.
- Penolakan wajib memiliki catatan.
- Peserta dapat membatalkan permohonan pending sendiri.
- Approved tetapi belum digunakan hanya dapat dibatalkan oleh role berizin.
- Pergerakan hanya bisa dicatat setelah approved.
- Keluar/kembali/pulang lebih awal memakai selfie, lokasi, dan waktu server.
- Maksimal satu izin sementara aktif per peserta per hari; izin selesai lebih dari satu kali diperbolehkan.
- Izin sementara tidak menggantikan check-out.
- Belum kembali sampai akhir hari menjadi `NEEDS_REVIEW`, bukan auto-checkout.
- Pulang lebih awal yang approved dan dicatat menjadi check-out hari itu.

Kategori awal yang diusulkan: Kampus, Kesehatan, Keluarga, Dinas, Lainnya. Daftar final menunggu pemilik proses.

## 9. Koreksi dan audit

- Koreksi hanya oleh role yang memiliki permission dan scope.
- Alasan wajib.
- Nilai asli tidak dihapus.
- Simpan before/after, actor, server timestamp, objek, alasan, request/correlation ID.
- Histori dan report menandai catatan yang dikoreksi.
- Audit tidak dapat diedit melalui UI operasional.
- Koreksi tidak boleh menciptakan duplikasi event.
- Setiap override prosedur normal harus memiliki reason code dan catatan.

## 10. Data Master

Admin HR mengelola data operasional sesuai permission. Administrator IT mengelola role/permission/policy dan konfigurasi teknis. Katalog MVP:
- Biro dan divisi.
- Peserta, pembimbing, admin, penugasan.
- Lokasi penempatan.
- Jadwal, kalender, toleransi, parameter absensi.
- Kategori izin.
- Role, permission, feature tree.
- ABAC policy dan ReBAC relationship.
- Kategori dan artikel Pusat Bantuan.

Data Master tidak boleh menerima script, executable code, SQL bebas, atau secret. Perubahan harus tervalidasi, diaudit, dan memiliki effective date/version bila memengaruhi aturan. Master yang dinonaktifkan tidak menghapus histori yang merujuk kepadanya.

## 11. Laporan dan statistik

- Peserta yang terjadwal tetap muncul meskipun tidak memiliki event.
- Filter tanggal, peserta, biro, divisi, status, dan penempatan sesuai permission.
- Kolom minimum: Nomor ID, nama, biro, divisi, tanggal, check-in, check-out, status, izin, durasi izin, koreksi.
- Ekspor CSV/XLSX mengikuti filter dan scope backend.
- Foto dan koordinat detail tidak disertakan dalam ekspor default.
- Metrik: terjadwal, hadir, tepat waktu, terlambat, lengkap, belum lengkap, tidak ada catatan, izin pending, sedang izin, sudah kembali, perlu review, pulang awal, koreksi.
- Definisi denominator dan kategori eksklusif harus terdokumentasi; hindari double count.
- Statistik dihitung di backend/database, bukan dengan mengambil seluruh data ke browser.

## 12. Acceptance criteria utama

- Login invalid ditolak; akun nonaktif tidak dapat login atau memakai sesi lama.
- Waktu perangkat diubah tidak memengaruhi timestamp server.
- Check-in/out valid menyimpan event, selfie, lokasi, akurasi, dan waktu server.
- Galeri tidak tersedia pada alur normal.
- Kamera/lokasi ditolak berarti tidak ada attendance event normal.
- Lokasi jauh tetap dicatat; tidak ada geofence.
- Retry dengan idempotency key sama tidak menggandakan event.
- Check-out sebelum check-in ditolak.
- Hari tanpa jadwal aktif ditolak.
- Peserta tidak dapat membaca data peserta lain.
- Pembimbing hanya dapat membaca peserta dalam relasi dan scope aktif.
- Peserta terjadwal tanpa event muncul di report.
- Koreksi tanpa alasan ditolak dan koreksi sah membuat audit before/after.
- Izin pending/rejected tidak dapat digunakan untuk pergerakan.
- Izin sementara belum kembali menjadi `NEEDS_REVIEW`.
- Pulang awal berizin menjadi check-out.
- Deny mengalahkan allow.
- Role baru tidak memperoleh permission otomatis.
- File MinIO tidak dapat diakses anonim atau lintas pengguna.
- Artikel draft tidak terlihat oleh pengguna biasa.
- Akun selesai dinonaktifkan tanpa menghapus histori.

## 13. Pertanyaan yang wajib dikonfirmasi sebelum pilot

- Jam kerja resmi per kelompok.
- Toleransi terlambat final.
- Kalender libur nasional dan hari kerja khusus.
- Apakah ada shift lintas tengah malam.
- Approval pembimbing atau admin saja.
- Kategori izin final.
- Aturan lokasi/kamera gagal dan prosedur koreksi formal.
- Admin scope biro/divisi.
- Akses pembimbing setelah hubungan berakhir.
- Format username dan mekanisme distribusi password awal.
- Apakah akun peserta selesai benar-benar nonaktif atau read-only.
- Retensi, penghapusan, legal hold, dan pemilik data.
- Jumlah peserta dan estimasi concurrency.
- Browser/OS minimum.
- Pemilik produk, admin pertama, dan pemilik insiden.
- Domain, server, TLS, backup, dan kebijakan produksi.
- MFA untuk akun privileged.
- Konten Pusat Bantuan awal.

## 14. Batas environment awal

Tahap ini hanya lokal dengan Docker Compose. Tidak menggunakan data pribadi peserta nyata. Seed hanya data dummy. Tidak melakukan deployment, integrasi eksternal, atau mengklaim siap produksi.
