# API CONTRACT — REST API Baseline

Base path: `/api/v1`. JSON is used unless multipart upload or file download is required. All timestamps are ISO-8601 UTC. Every endpoint must have runtime validation and OpenAPI documentation.

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
- `POST /auth/change-password`
- `POST /auth/forgot-password` (only if approved flow is implemented)
- `POST /auth/reset-password`

Use server-side sessions and HttpOnly cookies. Apply CSRF/origin protection to state-changing cookie-authenticated requests. Rate-limit login and password recovery.

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
- `/admin/organizations/bureaus`
- `/admin/organizations/divisions`
- `/admin/placements`
- `/admin/assignments`
- `/admin/schedules`
- `/admin/calendar`
- `/admin/leave-categories`
- `/admin/business-parameters`
- `/admin/roles`
- `/admin/permissions`
- `/admin/feature-tree`
- `/admin/policies`
- `/admin/scopes`

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
