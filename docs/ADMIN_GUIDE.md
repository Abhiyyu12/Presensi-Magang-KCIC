# Panduan Admin — Presensi Magang KCIC

Panduan singkat untuk Admin HR / Admin IT. Semua aksi admin tercatat di menu
**Audit**. Kebijakan resmi KCIC (jam kerja, toleransi telat, kategori izin)
masih menunggu konfirmasi — nilai yang ada adalah usulan dan bisa diganti
melalui Data Master.

## 1. Kelola pengguna (Data Master → Pengguna)

- **Tambah pengguna**: tombol *Tambah Pengguna* → isi username, nama, password
  sementara, email/telepon, role, dan (untuk peserta) profil magang
  (nomor peserta, biro/divisi/penempatan, tanggal mulai). Password sementara
  wajib diganti pengguna saat login pertama.
- **Ganti role pengguna**: kolom aksi → ikon peran → centang role yang berlaku.
- **Reset kata sandi**: aksi → *Buat Token Reset* → token ditampilkan sekali;
  bagikan ke pengguna (token 1 jam, sekali pakai).
- **Menonaktifkan** pengguna: ubah status akun menjadi NONACTIVE/SUSPENDED.
  Tidak ada hapus permanen — riwayat absensi harus tetap bisa diaudit.
- **Penugasan pembimbing**: tab Peserta/Penugasan → tentukan pembimbing dan
  periode bimbingan.

## 2. Import pengguna massal via Excel (Admin HR)

1. Buka **Data Master → Pengguna → Import Excel** → *Unduh Template*. Template
   berisi kolom `username, displayName, email, phone, participantNumber,
   bureauCode, divisionCode, placementCode, startDate, endDate, roleCode`
   beserta baris contoh dan dropdown biro/divisi/penempatan/role yang diambil
   langsung dari DB (bukan hardcode).
2. Isi baris pengguna baru. Aturan utama:
   - Tanggal format `YYYY-MM-DD`, contoh `2026-01-15`.
   - No. HP: `08xxxxxxxxxx` atau kode negara apa pun (mis. `+6281234567890`),
     tanpa spasi/tanda hubung. Kolom No. HP di template bertipe teks — Excel
     tidak menghapus 0 di depan dan tidak menjadikan `+` formula.
   - `roleCode` wajib role yang sudah ada; username & nomor peserta unik.
3. **Validate** → periksa laporan per baris (error ditampilkan per baris).
4. **Confirm** → pengguna dibuat dengan `mustChangePassword`; mereka wajib
   mengganti sandi saat login pertama.
5. Hasil import tercatat di Audit (jumlah dibuat/per baris gagal).

## 3. Role & permission (Pengguna & Hak Akses)

- Halaman **Pengguna & Hak Akses** (Admin IT) menampilkan pohon permission
  7 menu → submenu → fitur/aksi; centang per baris dengan efek ALLOW/DENY.
  Pencarian dan *pilih semua* tersedia per submenu.
- **Template sekali klik**: Administrator / Pembimbing / Peserta. Menerapkan
  template menimpa permission role terpilih.
- Role baru **selalu mulai tanpa permission**. Role dasar (kode/nama/status)
  dibuat di **Data Master → tab Role**.
- Detail lengkap: lihat [RBAC.md](RBAC.md).

## 4. Data Master harian

| Tab | Untuk apa |
|---|---|
| Biro / Divisi / Penempatan | struktur organisasi; nonaktifkan bila tutup, jangan hapus |
| Peserta | profil magang (nomor, biro, periode, status) |
| Penugasan | relasi peserta ↔ pembimbing |
| Cakupan (Scope) | wilayah administrasi admin (GLOBAL/BUREAU/DIVISION) |
| Jadwal | jam kerja per scope GLOBAL/BUREAU/DIVISION/INDIVIDUAL dengan tanggal efektif |
| Kalender | hari libur nasional & pengecualian hari kerja |
| Kategori Izin | kategori pengajuan izin (aktif/nonaktif) |
| Parameter | angka kebijakan (toleransi telat default, hari kerja default) dalam JSON |

## 5. Koreksi absensi & izin

- Koreksi dari **Monitoring → detail hari peserta** dengan alasan wajib
  (minimal 5 karakter); nilai before/after tercatat di Audit.
- Persetujuan izin (Approval): setujui/tolak **dengan catatan**; penolakan
  tanpa catatan ditolak sistem.
- Early checkout tanpa izin menandai hari sebagai *Perlu Review* — cek di
  Monitoring lalu koreksi bila perlu.

## 6. Audit & laporan

- **Audit**: filter per aktor/aksi/objek/waktu; read-only.
- **Laporan**: filter biro/divisi/tanggal; ekspor CSV/XLSX (tanpa foto/koordinat,
  diaudit). Tombol ekspor hanya muncul dengan permission `report:export`.

## 7. Profil admin sendiri

Menu **Profil** menampilkan data lengkap (role, biro/divisi, jadwal, pembimbing
bila relevan). Yang bisa diubah sendiri: **nama tampilan, email, telepon** —
email harus unik, telepon format Indonesia. Field lain hanya bisa diubah admin
lain lewat Data Master.
