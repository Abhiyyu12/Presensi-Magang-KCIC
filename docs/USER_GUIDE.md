# Panduan Pengguna — Presensi Magang KCIC

Panduan singkat memakai aplikasi absensi magang, ditulis untuk peserta magang yang
memakai ponsel. Bahasa sengaja dibuat sederhana. Semua jam yang tampil adalah
**WIB** dan **waktu resmi memakai waktu server**, bukan jam perangkat Anda.

> Aplikasi ini berjalan di lingkungan lokal/development dengan data dummy.
> Akun dan password diberikan oleh admin HR/IT.

---

## 1. Masuk (login)

1. Buka alamat aplikasi dari admin (contoh lokal: `http://localhost:5174`).
2. Isi **Username** dan **Kata sandi** yang diberikan admin, lalu tekan **Masuk**.
3. Bila diminta ganti kata sandi saat pertama masuk, ikuti instruksinya:
   isi kata sandi lama, lalu kata sandi baru minimal 8 karakter.
4. Bila muncul "Username atau password salah", periksa ejaan username dan
   huruf besar/kecil password. Bila tetap gagal, hubungi admin — jangan
   mencoba berulang-ulang karena ada pembatas percobaan login.

## 2. Mengenal layar utama

Di ponsel, menu utama ada di **bagian bawah layar**:

| Menu | Isi |
|---|---|
| **Beranda** | Status absensi hari ini dan tombol absen besar |
| **Absen** | Halaman ambil selfie untuk absen masuk/pulang |
| **Izin** | Ajukan izin sementara atau pulang lebih awal |
| **Riwayat** | Daftar absensi Anda sebelumnya + unduh CSV |
| **Menu** | Membuka daftar menu lengkap (Bantuan, Profil, dll.) |

Di desktop, menu yang sama tampil sebagai daftar di sisi kiri. Menu yang sedang
Anda buka ditandai dengan warna biru.

## 3. Absen masuk

1. Dari **Beranda**, tekan tombol besar **Absen Masuk** (atau menu **Absen**).
2. Browser akan meminta izin **kamera** dan **lokasi**. Tekan **Izinkan**.
   Kamera dipakai untuk selfie bukti absen; lokasi hanya dicatat sekali saat
   absen, bukan untuk melacak Anda terus-menerus.
3. Tekan **Buka Kamera**, posisikan wajah, lalu tekan **Ambil Foto**.
4. Tunggu sampai lokasi diperoleh (indikator lokasi berubah menjadi siap).
5. Periksa ringkasan **Konfirmasi absensi**: waktu server, jenis aksi, akurasi
   lokasi, dan foto Anda. Bila foto kurang jelas, tekan **Ulangi Foto**.
6. Tekan **Kirim Absensi**. **Jangan tutup halaman** selama pengiriman.
7. Layar hijau "Absensi berhasil disimpan" menampilkan waktu resmi server dan
   status hari Anda (mis. Hadir atau Terlambat). Selesai.

Bila pengiriman gagal (sinyal putus), tekan **Kirim Ulang** — sistem mencegah
absen ganda secara otomatis.

## 4. Absen pulang

- Tombol Beranda berubah menjadi **Absen Pulang** setelah absen masuk berhasil.
- Langkahnya sama persis dengan absen masuk (selfie + lokasi + konfirmasi).
- Bila Anda sudah absen masuk tetapi belum absen pulang **melewati jam pulang
  jadwal**, Beranda menampilkan banner pengingat dengan tombol langsung.
- Bila hari ini sudah lengkap (masuk + pulang), halaman Absen menampilkan
  ringkasan dan tautan ke Riwayat — tidak ada tombol absen lagi.

## 5. Hari libur / bukan hari kerja

Bila hari ini bukan hari kerja terjadwal Anda:

- Beranda dan halaman Absen menampilkan keterangan
  "Hari ini bukan hari kerja terjadwal" dan tombol absen **dinonaktifkan**.
- Ini normal, bukan kerusakan aplikasi. Bila jadwal Anda seharusnya berbeda,
  hubungi admin HR untuk memperbaiki jadwal.

## 6. Mengajukan izin

Izin hanya bisa diajukan **setelah absen masuk** pada hari itu.

1. Buka menu **Izin**, tekan **Ajukan Izin**.
2. Pilih jenis izin:
   - **Izin Sementara (akan kembali)** — keluar sebentar lalu kembali lagi
     (mis. urusan kampus). Isi perkiraan jam keluar dan jam kembali.
   - **Pulang Lebih Awal (tidak kembali)** — mengakhiri hari kerja lebih awal
     (mis. kontrol kesehatan). Isi perkiraan jam keluar.
3. Pilih kategori dan tulis alasan dengan jelas, lalu kirim.
4. Tunggu persetujuan admin/pembimbing. Status pengajuan terlihat di daftar
   Izin: Menunggu → Disetujui/Ditolak (penolakan selalu disertai catatan).
5. Bila **disetujui**, buka detail pengajuan izin Anda (tekan barisnya di
   daftar Izin), lalu pada kartu **Catat pergerakan**:
   - Izin Sementara: saat benar-benar keluar tekan **Keluar** (selfie +
     lokasi); saat kembali tekan **Kembali**. Hari kerja Anda berlanjut.
   - Pulang Lebih Awal: tekan **Pulang Lebih Awal** sekali; hari kerja
     Anda selesai dengan status khusus yang disetujui.
6. Bila izin sementara disetujui tetapi Anda tidak kembali sampai lewat batas,
   catatan ditandai untuk diperiksa admin — jangan mengabaikannya; hubungi
   pembimbing/admin bila ada keadaan darurat.

## 7. Riwayat dan unduh rekap

1. Buka menu **Riwayat**.
2. Gunakan chip cepat **7 hari terakhir**, **30 hari terakhir**, atau
   **Bulan ini** — atau atur tanggal sendiri lalu tekan **Terapkan**.
3. Tekan salah satu baris untuk melihat detail hari itu: jam masuk/pulang,
   status, bukti foto (bila diizinkan), dan catatan koreksi bila ada.
4. Tekan **Unduh CSV** untuk menyimpan rekap rentang yang sedang tampil ke
   perangkat Anda (berguna untuk laporan ke kampus). File CSV tidak memuat
   foto maupun titik koordinat Anda.

## 8. Bantuan dan Profil

- **Menu → Bantuan**: artikel panduan resmi (cara absensi, kebijakan izin, dll.).
- **Menu → Profil**: halaman profil menampilkan data lengkap Anda — username,
  role, kontak, serta untuk peserta: nomor peserta, biro/divisi/penempatan,
  periode magang, jadwal kerja aktif (per hari), dan daftar pembimbing.
- Yang bisa Anda ubah sendiri: **nama tampilan, email, telepon**. Email harus
  unik, telepon format nomor Indonesia (mis. `081234567890`). Field lain hanya
  bisa diubah admin. Nama baru langsung tampil di header tanpa perlu reload.
- Ganti kata sandi di bagian **Ubah kata sandi**.

## 9. Bila mengalami masalah

| Masalah | Yang harus dilakukan |
|---|---|
| Kamera tidak mau terbuka | Izinkan kamera di pengaturan browser/situs, lalu muat ulang halaman. Pakai browser Chrome/Safari terbaru. |
| Lokasi tidak diperoleh | Aktifkan GPS/lokasi perangkat dan izinkan untuk situs ini; pindah ke area terbuka; tekan coba lagi pada indikator lokasi. |
| "Akurasi lokasi" terlalu besar | Tunggu beberapa detik di tempat terbuka sampai angka akurasi mengecil, lalu ambil ulang. |
| Tombol absen tidak aktif | Periksa keterangan hari non-kerja di atas; bila jadwal salah, hubungi admin HR. |
| "Absen masuk sudah dilakukan hari ini" padahal merasa belum | Buka Riwayat hari ini; bila memang tercatat ganda/keliru, minta admin melakukan koreksi (admin punya jejak audit). |
| Lupa absen pulang | Hubungi admin HR/ pembimbing; koreksi waktu hanya bisa dilakukan admin dengan alasan tercatat. |
| Login ditolak terus | Tunggu ±15 menit (pembatas percobaan), lalu coba lagi; bila tetap gagal hubungi admin untuk reset kata sandi. |
| Halaman error / data tidak muncul | Tekan **Coba lagi**; bila berulang, tangkap layar dan kirim ke admin beserta jam kejadian. |

## 10. Untuk Pembimbing

- Menu: **Beranda, Monitoring, Izin Peserta, Laporan** (+ Bantuan, Profil).
- **Beranda** menampilkan jumlah peserta binaan, yang sudah/belum absen masuk,
  perlu review, dan izin menunggu — beserta daftar status peserta hari ini.
- **Monitoring** melihat absensi peserta dalam cakupan binaan Anda;
  **Izin Peserta** melihat pengajuan izin mereka (hanya baca);
  **Laporan** merekap dan mengunduh CSV/XLSX sesuai cakupan.
- Anda tidak mengubah data peserta; koreksi dan persetujuan izin dilakukan admin HR.

## 11. Untuk Admin HR / Admin IT

- **Admin HR**: Monitoring, Approval (setujui/tolak izin dengan catatan),
  Laporan, Data Master, Audit, Bantuan. Koreksi absensi dilakukan dari detail
  hari peserta dengan alasan wajib (minimal 5 karakter) dan tercatat di audit.
- **Kelola pengguna** (Data Master → Pengguna): tambah pengguna dengan password
  sementara (wajib diganti saat login pertama), ganti role, buat token reset
  kata sandi, dan **import massal via Excel** (unduh template → validate →
  confirm; error dilaporkan per baris).
- **Admin IT**: **Pengguna & Hak Akses** — pohon permission (7 menu → submenu →
  fitur/aksi) dengan efek ALLOW/DENY, pencarian, dan **template sekali klik**
  (Administrator / Pembimbing / Peserta). Role baru selalu mulai tanpa
  permission; role dasar dibuat di Data Master → tab Role. Perubahan akses
  tercatat di audit; detail di [RBAC.md](RBAC.md). Panduan lengkap admin:
  [ADMIN_GUIDE.md](ADMIN_GUIDE.md).
- Semua ekspor dan koreksi meninggalkan jejak audit yang bisa diperiksa di
  menu **Audit**.

---

Pertanyaan yang belum terjawab panduan ini? Buka **Menu → Bantuan**, atau
hubungi admin HR. Keputusan kebijakan resmi KCIC (jam kerja, toleransi telat,
kategori izin) masih menunggu konfirmasi dan dapat berubah melalui Data Master.