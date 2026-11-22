# SECURITY — Security Requirements and Threat Model

## 1. Security objectives

Protect credentials, selfie evidence, GPS, attendance/leave history, identity data, authorization policies, audit history, and storage credentials. Security is enforced by backend and database—not by hidden frontend controls.

## 2. Threat model

Threats include:
- Anonymous API access.
- Participant reading another participant's record.
- Supervisor accessing outside active assignment.
- Scoped admin crossing bureau/division boundary.
- Privilege escalation through role or override configuration.
- Replay/duplicate attendance submissions.
- Forged client timestamps or coordinates.
- Malicious or malformed image uploads.
- Public MinIO bucket or leaked signed URL.
- Session theft, CSRF, brute force, IDOR/BOLA.
- Secret leakage through Git, logs, frontend bundle, or Docker configuration.
- Dependency or container vulnerabilities.

The MVP does not guarantee prevention of GPS spoofing, device compromise, photo replay from another device, face impersonation, deepfake, or liveness attacks.

## 3. Authentication

- Passwords hashed with Argon2id; no plaintext/reversible storage.
- Server-side opaque sessions; store token hash only.
- HttpOnly, SameSite cookie; Secure under HTTPS.
- Rotate session after login and privilege changes.
- Revoke session on logout, password reset, and account deactivation.
- Rate-limit login and recovery. Current values (2026-11-22): login 30 requests / 15 minutes per IP — raised from 10 because office NAT/WiFi shares one public IP and 10 locked out all participants together; reset-password 10 / 15 minutes per IP. Store is in-memory (per-process); brute-force per account remains mitigated by Argon2id hashing and generic failure messages. Global API limit: 600 requests / minute.
- Generic login/recovery messages.
- CSRF and Origin validation for cookie-authenticated mutations.
- Privileged-account MFA is recommended; production policy pending.
- Bootstrap admin is development-only, must be changed on first use and never seeded in production.

## 4. Authorization

- Default deny.
- Backend checks every protected operation.
- RBAC grants action; ABAC evaluates subject/object/action/context; ReBAC evaluates relationships.
- Deny overrides allow.
- Object-level authorization on list, detail, download, update, delete, export, and aggregate queries.
- Scope is applied in database query, not only after fetching.
- Role creation starts with no permissions.
- A user cannot grant permissions beyond their grant authority.
- Supervisor access ends when active assignment ends; historical access requires explicit policy.
- Permission and relationship changes invalidate relevant caches.
- Test IDOR/BOLA and privilege escalation.

## 5. Selfie and GPS

- Camera capture is the normal attendance path; no gallery picker.
- Validate image byte size, MIME, magic bytes, dimensions, decode success, and allowed formats.
- Re-encode accepted image; strip unnecessary EXIF from derivative.
- Keep only necessary evidence metadata.
- Store GPS latitude/longitude/accuracy and server received time.
- Do not accept client timestamp as official time.
- Do not accept arbitrary manual coordinates through normal UI.
- GPS is evidence, not proof of physical presence.
- Do not collect continuous location.
- Do not expose selfie/GPS in default exports.
- Audit sensitive evidence access where required.

## 6. MinIO

- Private buckets only; anonymous access prohibited.
- Separate buckets/policies for attendance evidence and help media.
- Application uses least-privilege service credentials, not root credentials.
- Credentials stay server-side.
- Object keys use the format `{username}/{uuid}.jpg` (folder per-user, product decision 2026-11-22); username charset is validated at creation boundaries and re-checked before key generation; file names stay random UUIDs.
- Backend authorizes before stream or short-lived signed URL.
- Signed URL expiry is short and configurable; never log or persist as permanent URL.
- Upload size and rate limits.
- Reconciliation for orphaned/missing objects.
- MinIO console binds to localhost in local development.
- Backup and restore must be tested before production.

## 7. API and browser

- Validate all inputs and content types.
- Parameterized queries.
- CORS allowlist; no wildcard with credentials.
- Secure headers and CSP.
- Body and upload size limits.
- Rate limits for sensitive endpoints.
- Avoid unsafe HTML rendering.
- No secrets in frontend bundles.
- Clear sensitive client state on logout.
- No long-lived auth token in localStorage.
- No stack traces or internal database errors to clients.

## 8. Database and audit

- Least-privilege runtime DB user. **DEVIATION (documented 2026-11-22, not yet implemented):** docker-compose uses ONE initdb Postgres user (`POSTGRES_USER`, default `attendance_app`) for both runtime and migrations/seed (`api-migrate` service). The promised runtime/migration credential split is planned; current mitigation = local-only environment, localhost-bound port 5433, fake data only.
- Separate migration credentials where practical — see deviation above.
- Foreign keys, constraints, transactions, and indexes.
- Audit records cannot be modified through normal application routes.
- Do not log passwords, tokens, selfie bytes, signed URLs, or unnecessary precise GPS.
- Local development uses fake data only.
- Retention and deletion require data owner/privacy/legal approval.

## 9. Docker local security

- Host ports bind to `127.0.0.1`.
- No public PostgreSQL/MinIO exposure.
- `.env` ignored by Git.
- `.env.example` contains placeholders.
- Named volumes.
- No Docker socket mount.
- Non-root app containers where feasible.
- Pinned image versions.
- Health checks.
- No production credentials or data in local environment.

## 10. Required security tests

- Unauthenticated request denied.
- Participant cannot access another participant.
- Supervisor cannot access outside assignment.
- Scoped admin cannot cross scope.
- Deny overrides allow.
- New role has no permissions.
- Cannot grant unauthorized permission.
- Disabled user session rejected.
- Client timestamp cannot change official time.
- Duplicate request is idempotent.
- Private MinIO object cannot be fetched anonymously.
- Changing object ID/key does not expose another user's file.
- Expired signed URL rejected.
- Malformed/oversized image rejected.
- CSRF/CORS/session controls verified.
- Sensitive data absent from logs/default exports.
- Correction and access changes produce audit records.

## 11. Production release blockers

- Approved privacy/retention policy.
- HTTPS and secure cookie configuration.
- Secret manager/key rotation plan.
- MFA policy for privileged users.
- Private storage and authorization tests pass.
- Backup/restore and incident response tested.
- No default credentials.
- Critical/high vulnerabilities resolved or formally risk-accepted.
- Named data owner, system owner, and incident owner.
