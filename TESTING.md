# TESTING — Quality Strategy and Release Gates

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

The agent must document and implement scripts with equivalent commands:
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:integration`
- `pnpm test:e2e`
- `pnpm build`
- `pnpm db:migrate`
- `pnpm db:seed`

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
