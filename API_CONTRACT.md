# API CONTRACT — REST API Baseline

Base path: `/api/v1`. JSON is used unless multipart upload or file download is required. All timestamps are ISO-8601 UTC. Every endpoint must have runtime validation and OpenAPI documentation. The OpenAPI document is served as JSON only at `GET /api/v1/docs/json`; no Swagger UI is registered.

## 1. Standard response

Success:
```json
{
  "data": {},
  "meta": {
    "requestId": "uuid"
  }
}
```

Error:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Permintaan tidak valid.",
    "fieldErrors": {},
    "requestId": "uuid"
  }
}
```

Never return stack traces, SQL details, secrets, password hashes, session token hashes, or internal object credentials.

## 2. Authentication

- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /auth/csrf` (issues the double-submit CSRF token)
- `POST /auth/change-password`
- `POST /auth/reset-password`

`POST /auth/forgot-password` is NOT implemented; password recovery uses an admin-issued one-time token via `POST /admin/users/:userId/password-reset-token` (see §6).

Use server-side sessions and HttpOnly cookies. Apply CSRF/origin protection to state-changing cookie-authenticated requests. Rate-limit login and password recovery: login is limited to 30 requests / 15 minutes per IP (raised from 10 on 2026-11-22 because office NAT shares one IP; in-memory store), reset-password to 10 / 15 minutes per IP.

## 3. Dashboard and profile

- `GET /dashboard/participant`
- `GET /dashboard/supervisor`
- `GET /dashboard/admin`
- `GET /profile`
- `PATCH /profile`

Each dashboard response must be scoped to the authenticated user and permissions.

## 4. Attendance

- `GET /attendance/today`
- `POST /attendance/check-in`
- `POST /attendance/check-out`
- `GET /attendance`
- `GET /attendance/:attendanceId`
- `GET /attendance/:attendanceId/evidence`
- `GET /attendance/export` (personal history CSV; authenticated users with an intern profile only — rejected 403 otherwise; no photos/coordinates; audited as `ATTENDANCE_EXPORT_SELF`)

Submission requires:
- `Idempotency-Key` header.
- Multipart image field.
- Latitude, longitude, accuracy.
- No client-supplied official timestamp.
- Optional client-submitted timestamp may be retained only as untrusted diagnostic metadata if approved.

Backend must validate the expected next event and unique attendance day/event constraints. Evidence endpoint must authorize the underlying attendance record before returning a short-lived signed URL or streaming the file.

## 5. Leave

- `GET /leaves`
- `POST /leaves`
- `GET /leaves/categories` (applicant-facing read list of ACTIVE categories, guard `leave:request`; added 2026-11-22 — the admin CRUD list `/admin/leave-categories` is not readable by peserta)
- `GET /leaves/:leaveId`
- `POST /leaves/:leaveId/cancel`
- `POST /leaves/:leaveId/approve`
- `POST /leaves/:leaveId/reject`
- `POST /leaves/:leaveId/departure`
- `POST /leaves/:leaveId/return`
- `POST /leaves/:leaveId/early-checkout`

Approval/rejection requires permission and scope. Rejection requires a note. Movement endpoints require approved state, selfie, GPS, and idempotency.

## 6. Admin and master data

- `/admin/users`
- `/admin/users/:id/roles` (assign roles to a user)
- `/admin/users/:userId/password-reset-token` (admin-issued one-time reset token, shown once, audited)
- `/admin/intern-profiles`
- `/admin/organizations/bureaus`
- `/admin/organizations/divisions`
- `/admin/placements`
- `/admin/assignments`
- `/admin/schedules`
- `/admin/calendar`
- `/admin/leave-categories`
- `/admin/business-parameters`
- `/admin/roles` (read-only ACTIVE role catalog for user management; guard `admin:users:manage`)
- `/admin/attendance/:attendanceId/correction` (correction with mandatory reason, audited before/after)
- `/admin/audit` (read-only audit trail; guard `admin:audit:view`)
- `/admin/scopes`

Access-control administration lives under `/admin/access/*` (see §9), not `/admin/permissions|feature-tree|policies`.

Use CRUD methods only where allowed. Enforce effective dates, uniqueness, referential integrity, permission checks, and audit.

## 7. Reports and exports

- `GET /reports/attendance`
- `GET /reports/attendance/export?format=csv|xlsx`
- `GET /reports/statistics`

The same scope filters must apply to list and export. Use server-side pagination for interactive lists. Exports must be bounded, validated, and audited when sensitive.

## 8. Help center

- `GET /help/categories`
- `GET /help/articles`
- `GET /help/articles/:slug`
- `POST /admin/help/articles`
- `PATCH /admin/help/articles/:id`
- `POST /admin/help/articles/:id/publish`
- `POST /admin/help/articles/:id/archive`

Draft content must not be visible to users without appropriate permission.

## 9. Access control

- `GET /access/me/effective`
- `GET /admin/access/roles`
- `POST /admin/access/roles`
- `PATCH /admin/access/roles/:id`
- `PUT /admin/access/roles/:id/permissions`
- `GET /admin/access/permissions`
- `GET /admin/access/feature-tree`
- `POST /admin/access/feature-tree`
- `PATCH /admin/access/feature-tree/:id`
- `GET /admin/access/policies`
- `POST /admin/access/policies`
- `PATCH /admin/access/policies/:id`
- `GET /admin/access/simulate`

Simulation is diagnostic and must not grant access. Changes require audit and cache invalidation.

## 10. Query rules

- Default page size 15; maximum 100.
- Allowlisted sort keys only.
- Date ranges use inclusive start and exclusive end.
- Filter values are validated and scoped.
- Search strings have bounded length.
- No endpoint may return all records by default.
- Every endpoint must document authentication, permission, object scope, validation, response, errors, and idempotency behavior.
