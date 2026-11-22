# RBAC — Pengguna & Hak Akses

Dokumen ini menjelaskan model hak akses aplikasi Presensi Magang KCIC: pohon
permission (Menu → Submenu → Fitur/Aksi), template role bawaan, dan aturan
main saat mengubah hak akses lewat UI.

- **Sumber kebenaran permission** adalah tabel `permissions` di DB. Pohon di
  bawah hanyalah peta UI (halaman **Pengguna & Hak Akses → Permission**).
- Kode yang tidak terpetakan di pohon tetap berlaku dan muncul di grup
  **Lainnya**; kode pohon yang tidak ada di DB diabaikan.
- Semua perubahan role/permission/feature tree/policy tercatat di menu **Audit**.

## 1. Pohon permission (7 menu, 30 kode)

### Beranda & Bantuan
| Submenu | Permission |
|---|---|
| Beranda | `dashboard:view` |
| Pusat Bantuan | `help:view`, `admin:help:manage` |

### Absensi
| Submenu | Permission |
|---|---|
| Absensi Pribadi | `attendance:submit`, `attendance:view:own` |
| Pemantauan & Koreksi | `attendance:view:scoped`, `attendance:evidence:view`, `attendance:correct` |

### Izin
| Submenu | Permission |
|---|---|
| Izin Pribadi | `leave:request`, `leave:view:own`, `leave:cancel:approved` |
| Persetujuan Izin | `leave:view:scoped`, `leave:approve` |

### Laporan
| Submenu | Permission |
|---|---|
| Laporan & Ekspor | `report:view`, `report:export` |

### Data Master
| Submenu | Permission |
|---|---|
| Pengguna | `admin:users:manage`, `admin:assignments:manage` |
| Organisasi & Penempatan | `admin:org:manage`, `admin:placements:manage` |
| Jadwal & Operasional | `admin:schedules:manage`, `admin:calendar:manage`, `admin:leave-categories:manage`, `admin:params:manage` |

### Akses & Keamanan
| Submenu | Permission |
|---|---|
| Role & Permission | `access:roles:manage`, `access:permissions:view`, `access:simulate` |
| Feature Tree, Policy & Scope | `access:feature-tree:manage`, `access:policies:manage`, `access:scopes:manage` |

### Audit
| Submenu | Permission |
|---|---|
| Jejak Audit | `admin:audit:view` |

## 2. Template role (klik satu tombol, tersimpan di backend)

| Template | Isi permission |
|---|---|
| **Administrator** | semua 30 kode di atas |
| **Pembimbing** | `dashboard:view`, `help:view`, `attendance:view:scoped`, `attendance:evidence:view`, `leave:view:scoped`, `report:view`, `report:export` |
| **Peserta** | `dashboard:view`, `help:view`, `attendance:submit`, `attendance:view:own`, `attendance:evidence:view`, `leave:request`, `leave:view:own` |

Template diterapkan dari halaman **Pengguna & Hak Akses → tab Role & Permission**
(tombol *Terapkan Template*). Menerapkan template **menimpa** daftar permission
role yang dipilih; konfirmasi dulu bila role sudah disetel manual.

## 3. Cara hak akses dihitung

1. **Role** pengguna (tabel `user_role_assignments`) membawa daftar
   `role_permissions` dengan efek `ALLOW` atau `DENY`.
2. **Override per pengguna** (`user_permission_overrides`) bisa menambah/menolak
   satu kode tanpa mengubah role.
3. **Policy ABAC** (`abac_policies`) dapat menolak akses berbasis kondisi
   (mis. hanya biro tertentu).
4. Hasil akhir dievaluasi server pada **setiap request** (RBAC + scope admin +
   scope bimbingan). Frontend hanya menyembunyikan menu/tombol; **keputusan
   final selalu di backend** — akses URL langsung tanpa permission akan
   dialihkan ke Beranda, dan API tetap menjawab `403`.

## 4. Aturan main (guard penting)

- **Tidak bisa memberi yang tidak dimiliki.** Admin yang menyetel permission
  secara manual tidak dapat memberi kode yang tidak ia pegang sendiri
  (API menolak dengan 403). Pengecualian: penerapan template Administrator
  hanya oleh admin dengan `access:roles:manage`.
- **Role sistem tidak dapat dihapus**, dan role yang masih tercatat pada
  penugasan pengguna juga ditolak API (tombol Hapus pun disembunyikan di UI).
  Nonaktifkan role (status → Nonaktif) bila tidak lagi dipakai.
- **Menu mengikuti permission.** Sidebar dibangun dari permission efektif
  (`GET /access/me/effective`); perubahan terlihat setelah login ulang atau
  refresh data sesi.
- **Simulasi bukan pemberi akses.** Tab Simulasi hanya alat diagnosa: menghitung
  keputusan efektif untuk kombinasi user × permission tanpa mengubah apa pun.

## 5. Halaman terkait

| Halaman | Tab | Permission minimal untuk melihat tab |
|---|---|---|
| Pengguna & Hak Akses | Role & Permission | `access:roles:manage` atau `access:permissions:view` |
| Pengguna & Hak Akses | Feature Tree | `access:feature-tree:manage` |
| Pengguna & Hak Akses | ABAC/ReBAC | `access:policies:manage` |
| Pengguna & Hak Akses | Simulasi | `access:simulate` |
| Data Master → Role | CRUD role dasar | `admin:users:manage` |

Role dasar (kode, nama, status) dikelola di **Data Master → tab Role**;
daftar permission-nya dikelola di **Pengguna & Hak Akses**.
