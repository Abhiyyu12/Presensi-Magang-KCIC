# TESTING — Quality Strategy and Release Gates

Status aktual (2026-11-22, pasca-Fase 6): API 38 test hijau — 29 integrasi (`apps/api/test/api.test.ts`, Fastify inject) + 9 unit (`apps/api/test/unit.test.ts`); DB test terpisah `attendance_test` di-DROP+CREATE setiap run (skip via `KEEP_TEST_DB=1`). Web 24 unit test hijau (`apps/web/src/lib/*.test.ts`). Lint hijau di kedua app (`.eslintrc.cjs`, eslint 8 + @typescript-eslint 8 + react-hooks, `--max-warnings 0`).

## 1. Testing pyramid

1. Unit tests for pure business rules and calculations.
2. Integration tests for services, repositories, database transactions, and MinIO.
3. API tests for validation, authentication, authorization, and error mapping.
4. E2E tests for complete user journeys.
5. Security tests for IDOR/BOLA, privilege escalation, CSRF, uploads, and storage.
6. Manual device tests for camera and geolocation.

## 2. Required test suites

### Unit
- Schedule resolution priority.
- Working day and holiday calculation.
- Late calculation and timezone boundaries.
- Attendance state transitions.
- Leave state transitions.
- Permission evaluator (RBAC + ABAC + ReBAC).
- Report metric denominator and no-double-count logic.
- Input schema and image metadata validation.

### Integration
- Migrations from empty database.
- Seed idempotency.
- Attendance transaction and unique constraints.
- Idempotency replay.
- Leave approval concurrency.
- Leave departure/return state transitions.
- Correction audit transaction.
- MinIO upload, private read, cleanup compensation.
- Orphan object reconciliation.
- Session revocation on account disable.

### API
- Authentication and rate limits.
- All protected endpoints reject unauthenticated users.
- Scope enforcement on list/detail/export/download.
- Stable error envelopes.
- Invalid body/query/path rejected.
- Pagination maximum enforced.
- CORS/CSRF/session cookie behavior.

### E2E

**BELUM DIOTOMASI — direncanakan.** Tidak ada script `test:e2e` maupun suite Playwright di repo. Verifikasi saat ini = 24 unit test web + 38 test API (inject end-to-end) + uji browser ad-hoc memakai skrip Playwright Python di luar repo (per role pada viewport 360×740, 390×844, 1280×800; golden path peserta lengkap: check-in kamera palsu + geolocation → check-out → riwayat → unduh CSV → ajukan izin → PENDING → batalkan → CANCELLED; desktop: monitoring→detail, laporan, master, audit, approval). Daftar journey di bawah adalah cakupan yang direncanakan untuk suite E2E terotomasi:

1. Admin bootstrap login and password change.
2. Admin creates organization, participant, supervisor, schedule, assignment.
3. Participant login.
4. Participant completes check-in with camera and location.
5. Participant completes check-out.
6. Participant submits temporary leave.
7. Admin approves; participant departs and returns.
8. Participant requests early departure; admin approves; participant checks out.
9. Supervisor sees only assigned participants.
10. Admin corrects attendance with reason; audit is visible to authorized role.
11. Participant cannot open another participant's history/evidence.
12. Help article draft/publish visibility.
13. CSV/XLSX export follows filter and scope.
14. Disabled account cannot use old session.

## 3. Security test matrix

- Participant A requests Participant B attendance ID -> 403/404 without data leak.
- Supervisor outside assignment requests participant -> denied.
- Scoped admin crosses division -> denied.
- User attempts to grant higher role -> denied.
- New role -> no permission by default.
- Deny override + role allow -> denied.
- Client timestamp changed -> server time remains authoritative.
- Client submits unsupported coordinates -> rejected or ignored according to strict DTO; never treated as trusted.
- Same idempotency key and same request -> same result, no duplicate.
- Same key with different request hash -> conflict.
- Anonymous MinIO object request -> denied.
- Object key substitution -> denied.
- Expired signed URL -> denied.
- Invalid magic bytes/oversized image -> rejected.
- Sensitive logs scan -> no credentials, selfie bytes, signed URLs, or unnecessary GPS.

## 4. Camera/GPS manual device matrix

Test at minimum:
- Android Chrome: permission granted, denied, revoked, camera unavailable, location unavailable.
- iOS Safari: permission granted/denied and camera lifecycle behavior.
- Desktop Chrome/Edge for admin.
- Browser tab refresh during capture/upload.
- Network disconnect during upload and retry.
- Low GPS accuracy and timeout.
- HTTPS requirement for camera/geolocation in non-local environments; localhost secure-context behavior verified.

## 5. Commands

Scripts that exist and run today (root `package.json` + per-app):
- `pnpm lint` (per-app: `pnpm --filter api lint`, `pnpm --filter web lint`; `--max-warnings 0`)
- `pnpm typecheck`
- `pnpm test` (API 38 + web 24)
- `pnpm test:integration` (= `pnpm --filter api test`)
- `pnpm build`
- `pnpm db:migrate`
- `pnpm db:seed`

BELUM DIOTOMASI — direncanakan:
- `pnpm test:e2e` — script dan suite Playwright belum ada di repo; verifikasi saat ini = uji browser ad-hoc (lihat §2 E2E).

Do not claim a command passed unless it was executed and its exit code was zero.

## 6. Release gates

### Gate A — Foundation
- Docker services healthy.
- DB migration works from empty volume.
- API and web health checks pass.
- Lint/typecheck/build pass.

### Gate B — Security foundation
- Auth/session tests pass.
- RBAC/ABAC/ReBAC negative tests pass.
- MinIO private-access tests pass.
- Audit behavior verified.

### Gate C — MVP workflows
- Check-in/out E2E pass.
- Leave E2E pass.
- History/report E2E pass.
- Admin/master data E2E pass.

Catatan jujur: E2E terotomasi BELUM DIOTOMASI — direncanakan. Verifikasi saat ini = test API inject untuk seluruh alur di atas (check-in/out, izin lengkap, koreksi, report/export, master data, IDOR) + uji browser ad-hoc per role (login→dashboard→absensi→izin→riwayat→master→audit).

### Gate D — Clean-room verification
- Remove local volumes only after explicit confirmation.
- Rebuild images.
- Start from clean Docker environment.
- Apply migrations and seed.
- Run all tests.
- Verify no required manual undocumented steps.
- Produce evidence report.

## 7. Bug severity

- P0: data exposure, privilege escalation, data corruption, credentials leak, attendance integrity compromise.
- P1: core workflow unusable, migration/data loss, duplicate attendance, broken authorization scope.
- P2: important feature broken with workaround.
- P3: cosmetic or low-impact issue.

P0/P1 block completion. P2/P3 must be documented and prioritized.
