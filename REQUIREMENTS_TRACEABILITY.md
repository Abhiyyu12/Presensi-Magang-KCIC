# REQUIREMENTS TRACEABILITY — Presensi Magang KCIC

Status mengacu pada definisi: `IMPLEMENTED` = kode ada; `VERIFIED` = acceptance criteria + test lulus dengan bukti tercatat. Kolom **Bukti verifikasi** merujuk log pipeline (`infra/pipeline.log`, `infra/typecheck.log`, `infra/test.log`) — pipeline baseline selesai: backend 33/33 test hijau (VITEST_EXIT=0, TSC_EXIT=0), frontend 23/23 hijau; clean-room Docker stack hijau 2026-11-22. Status terkini (2026-11-22, pasca-Fase 6): API 38/38 (29 integrasi + 9 unit), web 24/24, lint kedua app hijau; uji browser ad-hoc golden path peserta (check-in → check-out → riwayat → CSV → izin ajukan/batal) + alur kritis per role pada 360/390/1280.

Catatan sitasi: `PRD.md` (v4.0) memakai bagian bernomor (§1–§14), bukan ID requirement seperti `AUTH-01`. Kolom "PRD IDs" lama mengutip ID yang tidak ada di PRD; per 2026-11-22 sitasi dipetakan ulang ke bagian PRD yang nyata. Kolom implementasi/bukti tidak diubah.

| Requirement group | PRD IDs | Backend | Database | Frontend | Permission | Tests | Status |
|---|---|---|---|---|---|---|---|
| Authentication (login/logout/sesi/CSRF/rate-limit/change+reset password) | PRD §4 (login, tanpa registrasi publik), §5 (Login/Username), §12 (login invalid; akun nonaktif) | src/modules/auth/{routes,sessions,password,csrf}.ts | users, sessions, password_reset_tokens | pages Login, Profil (ganti password) | sesi HttpOnly + CSRF double-submit + Origin allowlist; klien membaca cookie csrf_token yang dirotasi server (D-029) | api.test.ts: 401 unauth, pesan generik login gagal, 403 tanpa CSRF, deaktivasi→401; api.test.ts (web): cookie CSRF rotasi dipakai menggantikan cache basi | VERIFIED |
| Organization and users | PRD §10 (biro/divisi, peserta/pembimbing/admin), §3.3 | src/modules/admin/routes.ts (bureaus/divisions/placements/users/intern-profiles) | bureaus, divisions, placements, intern_profiles | halaman Data Peserta & Organisasi | admin:org:manage / admin:users:manage + scope GLOBAL/scoped | api.test.ts: deaktivasi user mencabut sesi | VERIFIED |
| Assignments & scopes (ReBAC) | PRD §3.2, §4 (RBAC+ABAC+ReBAC), §12 (pembimbing hanya relasi aktif) | admin/routes.ts (assignments, scopes), access/scope.ts | supervisor_assignments, admin_scopes | supervisor/admin pages | isActiveSupervisorOf, adminScopeCovers, default-deny internScopeWhere | api.test.ts: IDOR 404 (peserta lain), evidence 404 | VERIFIED |
| Scheduling & calendar | PRD §6, §5 (prioritas jadwal, hari kerja, toleransi) | src/modules/schedules/{service,routes}.ts | work_schedules, work_schedule_days, calendar_days, workday_snapshots | Jadwal & Kalender | admin:schedules:manage, admin:calendar:manage | api.test.ts: jadwal individual membuat hari kerja deterministik; unit.test.ts: weekday/WIB | VERIFIED |
| Check-in/out + bukti + idempotency | PRD §7, §2 (prinsip 1–2, 5–6), §12 | src/modules/attendance/{service,routes}.ts, src/modules/files/service.ts | attendance_days, attendance_events, file_objects | halaman Absensi (kamera+lokasi+konfirmasi) | attendance:submit (self), evidence via scope | api.test.ts: sekuens 409, check-in/out 201, replay idempoten, duplikat 409, signed URL 200 | VERIFIED |
| Leave workflow | PRD §8, §12 | src/modules/leaves/{service,routes}.ts (+ GET /leaves/categories, D-028) | leave_requests, leave_categories, leave_events (+partial unique index 1 temporary aktif/hari) | Izin: pengajuan, approval, timeline | leave:request (owner), leave:approve (scope) | api.test.ts: create→reject-validasi→approve→departure→return; early-checkout→EARLY_DEPARTURE_APPROVED; kategori ACTIVE untuk peserta + 403 non-peserta; uji browser: ajukan→PENDING→batal→CANCELLED | VERIFIED |
| Corrections | PRD §9, §2 (prinsip 9) | attendance/service.ts correctAttendance + route /admin/attendance/:id/correction | attendance_events (CORRECTED), audit before/after | halaman Koreksi | attendance:correct | api.test.ts: koreksi 200 + audit trail; reason <5 → 400 | VERIFIED |
| History | PRD §4 (riwayat & timeline), §3.1 | attendance listAttendance/getAttendanceDetail/getToday + GET /attendance/export | attendance + leave | Riwayat & Timeline (preset 7/30 hari/bulan ini + Unduh CSV) | object-level scope (self/supervisor/admin); scope pribadi = internProfileId | api.test.ts: today 200, IDOR 404, list pribadi memuat hari sendiri, CSV pribadi berisi baris tanpa koordinat | VERIFIED |
| Reports & export | PRD §11 | src/modules/reports/{service,routes}.ts | snapshot-driven rows, index | Report & Statistik | report:view / report:export | api.test.ts: rows+metrics, CSV attachment tanpa koordinat, peserta 403 | VERIFIED |
| Access control (RBAC+ABAC+feature tree+simulate) | PRD §3.4, §4, §10, §12 (deny mengalahkan allow; role baru tanpa permission) | src/modules/access/{evaluator,context,scope,routes}.ts | roles, permissions, role_permissions, user_permission_overrides, abac_policies, feature_nodes | Access management | access:* hanya ADMIN_IT | unit.test.ts: deny-overrides, default-deny, ABAC all/any/not; api.test.ts: role zero-permission, simulate false, ADMIN_HR 403 | VERIFIED |
| Master data | PRD §10 (kategori izin, parameter; larangan script/SQL bebas) | admin/routes.ts (leave-categories, business-parameters) | leave_categories, business_parameters (versioned) | Data Master UI | admin scope GLOBAL | api.test.ts: key `sql` → 422 | VERIFIED |
| Audit | PRD §9 | common/audit.ts + modules/audit/routes.ts | audit_events | Audit view | admin:audit:view (IT-only) | api.test.ts: audit koreksi before/after terbaca | VERIFIED |
| Help center | PRD §4 (Pusat Bantuan), §10, §12 (artikel draft tidak terlihat) | src/modules/help/routes.ts | help_categories, help_articles | Pusat Bantuan | admin:help:manage; non-manager PUBLISHED-only | api.test.ts: draft → 404 untuk peserta, 200 untuk admin | VERIFIED |
| Docker/local infra | PRD §14, §4 (Docker Compose lokal, PostgreSQL, MinIO) | docker-compose.yml, apps/*/Dockerfile, infra/scripts/* | postgres_data, minio_data volumes; migrations | web (nginx) | localhost binding 127.0.0.1 saja | clean-room `docker compose down -v && up -d --build`: migrate+seed exit 0, api healthy, /health/ready db+minio true, web 200, login 200 | VERIFIED |
| Frontend keseluruhan | DESIGN.md §2–§3 (inventaris halaman; bukan ID PRD) | — | — | apps/web (lengkap: 17+ halaman, guard dikoreksi ke kode permission katalog, fetchMe unwrap envelope) | navigasi dari /access/me/effective + guard route | 24/24 vitest hijau, tsc bersih, uji browser: login→dashboard→absensi (hard reload OK), golden path check-in/out→riwayat→CSV→izin ajukan/batal | VERIFIED |

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
