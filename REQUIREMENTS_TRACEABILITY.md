# REQUIREMENTS TRACEABILITY — Presensi Magang KCIC

Status mengacu pada definisi: `IMPLEMENTED` = kode ada; `VERIFIED` = acceptance criteria + test lulus dengan bukti tercatat. Kolom **Bukti verifikasi** merujuk log pipeline (`infra/pipeline.log`, `infra/typecheck.log`, `infra/test.log`) — pipeline selesai: backend 33/33 test hijau (VITEST_EXIT=0, TSC_EXIT=0), frontend 23/23 hijau; clean-room Docker stack hijau 2026-11-22.

| Requirement group | PRD IDs | Backend | Database | Frontend | Permission | Tests | Status |
|---|---|---|---|---|---|---|---|
| Authentication (login/logout/sesi/CSRF/rate-limit/change+reset password) | AUTH-01..AUTH-12 | src/modules/auth/{routes,sessions,password,csrf}.ts | users, sessions, password_reset_tokens | pages Login, Profil (ganti password) | sesi HttpOnly + CSRF double-submit + Origin allowlist | api.test.ts: 401 unauth, pesan generik login gagal, 403 tanpa CSRF, deaktivasi→401 | VERIFIED |
| Organization and users | DM-01, DM-02 | src/modules/admin/routes.ts (bureaus/divisions/placements/users/intern-profiles) | bureaus, divisions, placements, intern_profiles | halaman Data Peserta & Organisasi | admin:org:manage / admin:users:manage + scope GLOBAL/scoped | api.test.ts: deaktivasi user mencabut sesi | VERIFIED |
| Assignments & scopes (ReBAC) | ReBAC requirements | admin/routes.ts (assignments, scopes), access/scope.ts | supervisor_assignments, admin_scopes | supervisor/admin pages | isActiveSupervisorOf, adminScopeCovers, default-deny internScopeWhere | api.test.ts: IDOR 404 (peserta lain), evidence 404 | VERIFIED |
| Scheduling & calendar | DM-03, DM-04, DM-05 | src/modules/schedules/{service,routes}.ts | work_schedules, work_schedule_days, calendar_days, workday_snapshots | Jadwal & Kalender | admin:schedules:manage, admin:calendar:manage | api.test.ts: jadwal individual membuat hari kerja deterministik; unit.test.ts: weekday/WIB | VERIFIED |
| Check-in/out + bukti + idempotency | ATT-01..ATT-18 | src/modules/attendance/{service,routes}.ts, src/modules/files/service.ts | attendance_days, attendance_events, file_objects | halaman Absensi (kamera+lokasi+konfirmasi) | attendance:submit (self), evidence via scope | api.test.ts: sekuens 409, check-in/out 201, replay idempoten, duplikat 409, signed URL 200 | VERIFIED |
| Leave workflow | LEAVE-01..LEAVE-18 | src/modules/leaves/{service,routes}.ts | leave_requests, leave_events (+partial unique index 1 temporary aktif/hari) | Izin: pengajuan, approval, timeline | leave:request (owner), leave:approve (scope) | api.test.ts: create→reject-validasi→approve→departure→return; early-checkout→EARLY_DEPARTURE_APPROVED | VERIFIED |
| Corrections | koreksi (ATT) | attendance/service.ts correctAttendance + route /admin/attendance/:id/correction | attendance_events (CORRECTED), audit before/after | halaman Koreksi | attendance:correct | api.test.ts: koreksi 200 + audit trail; reason <5 → 400 | VERIFIED |
| History | HIS requirements | attendance listAttendance/getAttendanceDetail/getToday | attendance + leave | Riwayat & Timeline | object-level scope (self/supervisor/admin) | api.test.ts: today 200, IDOR 404 | VERIFIED |
| Reports & export | REC/STAT requirements | src/modules/reports/{service,routes}.ts | snapshot-driven rows, index | Report & Statistik | report:view / report:export | api.test.ts: rows+metrics, CSV attachment tanpa koordinat, peserta 403 | VERIFIED |
| Access control (RBAC+ABAC+feature tree+simulate) | ACCESS requirements | src/modules/access/{evaluator,context,scope,routes}.ts | roles, permissions, role_permissions, user_permission_overrides, abac_policies, feature_nodes | Access management | access:* hanya ADMIN_IT | unit.test.ts: deny-overrides, default-deny, ABAC all/any/not; api.test.ts: role zero-permission, simulate false, ADMIN_HR 403 | VERIFIED |
| Master data | DM requirements | admin/routes.ts (leave-categories, business-parameters) | leave_categories, business_parameters (versioned) | Data Master UI | admin scope GLOBAL | api.test.ts: key `sql` → 422 | VERIFIED |
| Audit | audit requirements | common/audit.ts + modules/audit/routes.ts | audit_events | Audit view | admin:audit:view (IT-only) | api.test.ts: audit koreksi before/after terbaca | VERIFIED |
| Help center | HELP requirements | src/modules/help/routes.ts | help_categories, help_articles | Pusat Bantuan | admin:help:manage; non-manager PUBLISHED-only | api.test.ts: draft → 404 untuk peserta, 200 untuk admin | VERIFIED |
| Docker/local infra | architecture requirements | docker-compose.yml, apps/*/Dockerfile, infra/scripts/* | postgres_data, minio_data volumes; migrations | web (nginx) | localhost binding 127.0.0.1 saja | clean-room `docker compose down -v && up -d --build`: migrate+seed exit 0, api healthy, /health/ready db+minio true, web 200, login 200 | VERIFIED |
| Frontend keseluruhan | DESIGN.md pages | — | — | apps/web (lengkap: 17+ halaman, guard dikoreksi ke kode permission katalog, fetchMe unwrap envelope) | navigasi dari /access/me/effective + guard route | 23/23 vitest hijau, tsc bersih, uji browser: login→dashboard→absensi (hard reload OK) | VERIFIED |

## Keputusan KCIC yang PENDING (tidak dikarang)

- Jam kerja resmi & toleransi keterlambatan (seed memakai usulan 09:00–18:00 / 15 menit, status `PENDING_KCIC_CONFIRMATION`).
- Hari kerja default (usulan Senin–Jumat, `PENDING_KCIC_CONFIRMATION`).
- Daftar kategori izin resmi (usulan KAMPUS/KESEHATAN/KELUARGA/DINAS/LAINNYA).
- Minimum versi browser mobile (menunggu uji pilot perangkat nyata).

## Required status values

- `NOT STARTED`
- (tidak ada — seluruh baris VERIFIED; pengecualian: uji perangkat mobile nyata menunggu pilot)
- `BLOCKED`
- `IMPLEMENTED`
- `VERIFIED`

`IMPLEMENTED` means code exists. `VERIFIED` means acceptance criteria and relevant tests passed with recorded evidence. Only `VERIFIED` counts as done.
