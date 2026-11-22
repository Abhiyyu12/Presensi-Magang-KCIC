# DESIGN — UX/UI Specification

## 1. Design goals

- Mobile-first because participants primarily use phones.
- Clear, fast attendance workflow.
- Admin and supervisor workflows optimized for desktop while remaining responsive.
- Bahasa Indonesia as default language.
- Accessible labels, keyboard navigation, visible focus, readable contrast.
- No success state before server persistence.
- Do not expose sensitive evidence to unauthorized roles.

## 2. Navigation by role

### Peserta
- Dashboard
- Absensi
- Izin Tengah Hari
- Riwayat & Timeline
- Pusat Bantuan
- Profil/Akun

### Pembimbing
- Dashboard
- Peserta Bimbingan
- Monitoring/Riwayat
- Report & Statistik
- Pusat Bantuan
- Profil/Akun

### Admin Magang/HR
- Dashboard
- Data Peserta & Pengguna
- Organisasi & Penempatan
- Jadwal & Kalender
- Monitoring Absensi
- Approval Izin
- Koreksi
- Report & Statistik
- Data Master
- Pusat Bantuan
- Audit sesuai permission
- Profil/Akun

### Administrator IT
- Dashboard Administrasi
- Role & Permission
- Feature Tree
- ABAC/ReBAC
- Konfigurasi teknis yang diizinkan
- Audit keamanan
- Fitur operasional hanya jika diberi permission

Navigation is generated from effective permission data. Hiding a menu is not security enforcement.

## 3. Page inventory

| Page | Main content |
|---|---|
| Login | Username, password, show/hide, error, recovery link if enabled |
| Participant dashboard | Today's schedule, attendance state, primary CTA, leave status |
| Camera attendance | Permission status, camera preview, capture, retake, location status |
| Attendance confirmation | Server time WIB, status, evidence thumbnail, location recorded |
| Leave request | Type, category, reason, estimated departure/return |
| Leave detail | Approval state, notes, departure/return/early checkout timeline |
| Participant history | Date filter, paginated list, detail |
| Supervisor dashboard | Assigned intern summary, pending review |
| Assigned interns | Search, scope filters, pagination |
| Reports | Filters, server-side table, export |
| Admin dashboard | Pending approvals, needs-review, today's metrics |
| Attendance monitoring | Search/filter, detail, authorized evidence |
| Leave approval | Queue, detail, approve/reject with note |
| Correction | Original value, proposed value, reason, audit preview |
| Master data | Tables/forms, effective dates, validation, audit |
| Access management | Roles, feature tree, scopes, effective permission |
| Help center | Categories, search, articles |
| Profile | Account details, change password, logout |

## 4. Attendance interaction

1. Show today's schedule and current status.
2. Enable only the next valid action.
3. Explain camera and location requirements before requesting permission.
4. Request camera and geolocation.
5. Show camera preview and capture action.
6. Allow retake before submission.
7. Show location acquisition and accuracy.
8. Show summary confirmation.
9. Submit with loading and disable repeated taps.
10. Show success only after server response confirms persistence.
11. On failure, preserve safe form state and show retry guidance; backend idempotency protects retry.

## 5. Camera and location states

Camera:
- idle
- requesting_permission
- permission_denied
- unavailable
- preview_ready
- captured
- uploading
- upload_failed
- completed

Location:
- idle
- requesting_permission
- permission_denied
- unavailable
- low_accuracy
- ready

Attendance:
- not_started
- submitting
- success
- late
- incomplete
- needs_review
- rejected

Do not represent unavailable location as success.

## 6. Leave states

- draft
- pending
- approved
- rejected
- cancelled
- departed
- returned
- needs_review
- completed

Only show movement CTAs when the leave state and permission allow them.

## 7. Tables and filters

- Default page size 15; optional 25/50; server cap 100.
- Server-side pagination, filter, sort.
- Date range, participant, bureau, division, status filters only within user's scope.
- Debounced search and bounded input length.
- Empty state explains no matching data.
- Loading state retains filter context.
- Export uses the same filter and authorization scope.
- Mobile tables use cards or controlled horizontal scrolling; do not hide important data silently.

## 8. Reusable components

- PageHeader
- StatusBadge
- DataTable
- ServerPagination
- FilterBar
- DateRangeFilter
- ConfirmDialog
- FormField
- EmptyState
- ErrorState
- LoadingState
- PermissionDenied
- CameraCapture
- LocationStatus
- Timeline
- AuditDiff
- FilePreview

Components must not hide domain rules or bypass backend validation.

## 9. Accessibility

- Every input has a visible or programmatic label.
- Keyboard access for primary actions.
- Visible focus.
- Dialog focus management.
- Color is not the only status signal.
- Errors linked to fields.
- Camera/location instructions are understandable.
- Mobile touch targets are comfortably usable.
- Respect reduced-motion preference.

## 10. Suggested UI copy

- Camera: “Izinkan akses kamera untuk mengambil selfie absensi.”
- Location: “Lokasi diperlukan sebagai bukti saat absensi. Lokasi tidak digunakan untuk melacak Anda terus-menerus.”
- Location error: “Lokasi belum berhasil diperoleh. Periksa izin lokasi dan layanan lokasi, lalu coba kembali.”
- Upload: “Mengirim bukti absensi… Jangan tutup halaman sampai proses selesai.”
- Success: “Absensi berhasil disimpan.”
- Pending: “Pengajuan izin menunggu persetujuan.”
- Review: “Catatan hari ini perlu diperiksa oleh admin.”
- Denied: “Anda tidak memiliki akses untuk melihat data ini.”

## 11. Responsive requirements

- Participant workflow: single-column mobile layout and reachable primary CTA.
- Admin/supervisor: desktop tables with compact mobile filter controls.
- Camera preview must fit narrow screens without cropping the captured evidence unexpectedly.
- Test Android Chrome and iOS Safari on real devices during pilot; exact minimum versions remain pending.
