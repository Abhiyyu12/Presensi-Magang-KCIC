# ARCHITECTURE — Technical Architecture

## 1. Architecture decision

Use a **Modular Monolith** with separate frontend and backend applications in one repository. One PostgreSQL database and one MinIO object store are used locally. Do not introduce microservices, message brokers, Kubernetes, or external SaaS dependencies for MVP.

## 2. Recommended stack for an empty repository

| Layer | Choice | Reason |
|---|---|---|
| Runtime | Node.js LTS, pinned via `.nvmrc` / `engines` | Common TypeScript ecosystem |
| Language | TypeScript strict mode | Type safety |
| Frontend | React + Vite + TypeScript | Web SPA, mobile-first |
| Routing | React Router | Route and role-aware navigation |
| Server state | TanStack Query | Caching, retries, invalidation |
| Forms | React Hook Form + Zod | Validation and typed forms |
| UI styling | Tailwind CSS + accessible component primitives | Consistent responsive UI |
| Backend | Fastify + TypeScript | Schema-first HTTP API |
| API schemas | Zod/JSON Schema strategy, one source per DTO | Runtime validation |
| Database | PostgreSQL | Relational integrity and transactions |
| Data access | Prisma ORM with explicit SQL where needed | Migrations and typed access |
| Authentication | Server-side session, opaque cookie | Revocation and HttpOnly |
| Object storage | MinIO, S3-compatible private buckets | Private selfie evidence |
| API docs | OpenAPI generated from route schemas | Contract visibility |
| Tests | Vitest + Fastify inject (unit/integration/API). Playwright E2E BELUM DIOTOMASI — direncanakan; verifikasi browser saat ini = skrip Playwright ad-hoc di luar repo | Unit, integration, API; E2E manual/ad-hoc |
| Containers | Docker Compose | Local reproducibility |

Versions must be selected as current supported stable versions at implementation time and pinned in lockfiles/image tags. Do not use floating `latest` tags. If a package is incompatible, document evidence and propose a replacement before switching.

## 3. Repository structure

Actual structure (verified 2026-11-22). There is no `packages/contracts` workspace and no `infra/docker` directory; the compose file lives at the repo root. `BUILD_LOG.md` and `DECISIONS.md` live at the repo root, not under `docs/`.

```text
/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── routes/        # page components (+ access/, master/ subpanels)
│   │   │   ├── components/    # Layout, DataTable, CameraCapture, NavIcon, …
│   │   │   ├── hooks/
│   │   │   ├── lib/           # api client, auth context, format, types (+ unit tests)
│   │   │   ├── test/
│   │   │   ├── App.tsx
│   │   │   ├── main.tsx
│   │   │   └── index.css
│   │   └── Dockerfile
│   └── api/
│       ├── src/
│       │   ├── app/           # buildApp.ts, auth.ts
│       │   ├── config/
│       │   ├── common/
│       │   ├── modules/
│       │   ├── infrastructure/
│       │   └── server.ts
│       ├── prisma/
│       │   ├── schema.prisma
│       │   ├── migrations/
│       │   └── seed.ts
│       ├── test/              # api.test.ts (integration), unit.test.ts
│       └── Dockerfile
├── docs/                      # AUDIT.md (UX audit); decisions register = root DECISIONS.md
├── infra/
│   ├── scripts/               # setup/doctor/reset/backup/restore/pipeline, minio-init.mjs
│   └── bin/                   # static mc binary (gitignored, downloaded host-side)
├── docker-compose.yml
├── BUILD_LOG.md
├── DECISIONS.md
├── .env.example
├── .gitignore
├── .dockerignore
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
└── README.md
```

## 4. Backend module boundaries

Each module owns its routes, schemas, application services, domain rules, repositories, and tests. Actual module directories under `apps/api/src/modules/` (verified 2026-11-22):

- `auth`: login, logout, session, CSRF, password change/reset, account status.
- `users`: user profile (`/profile`).
- `admin`: organizations (bureaus/divisions), placements, users + role assignment, intern profiles, supervisor assignments, admin scopes, leave categories, business parameters, attendance correction admin route, read-only role catalog, password-reset-token issuance.
- `schedules`: work schedules, calendar, exceptions, schedule resolution.
- `attendance`: check-in/out, personal CSV export, evidence orchestration, status calculation, idempotency, corrections.
- `leaves`: leave requests, approval, movement events, review state.
- `reports`: report queries, aggregation, CSV/XLSX export.
- `dashboard`: participant/supervisor/admin dashboards (including in-app pending counters/badges).
- `access`: roles, permissions, feature tree, ABAC/ReBAC evaluation, simulate.
- `audit`: append-oriented audit events and read-only audit trail API.
- `help`: categories and articles (Pusat Bantuan).
- `files`: MinIO abstraction, upload validation, authorized retrieval.

There is no separate `notifications` module; the MVP in-app badge/pending counters are served by the `dashboard` module.

Cross-module calls must use public application interfaces. Avoid importing another module's repository or private implementation.

## 5. Frontend module boundaries

The web app is organized by routes, not by module folders: page components in `apps/web/src/routes/` (login, participant/supervisor/admin dashboards, attendance, history, leaves, approvals, monitoring, reports, master data tabs, access, audit, help center, profile), shared UI in `components/`, API/auth/format logic in `lib/`, and hooks in `hooks/`. Domain areas covered:

- `auth`
- `dashboard`
- `attendance`
- `leaves`
- `history`
- `supervisor`
- `admin`
- `reports`
- `master-data`
- `access-control`
- `help-center`
- `profile`

Shared components must not contain hidden domain rules. Navigation derives from effective permissions returned by the backend, but backend authorization remains mandatory.

## 6. Request lifecycle

1. Request ID/correlation ID is created or validated.
2. Security headers, CORS, body limits, and rate limits apply.
3. Session is resolved.
4. Request schema validates params/query/body.
5. Authorization checks role permission, attributes, relationships, and object scope.
6. Application service executes business logic.
7. Repository performs scoped database operations and transaction.
8. Audit event is written for sensitive mutations.
9. Response is mapped to a stable API envelope.
10. Structured logs are emitted with redaction.

## 7. Time strategy

- Store instants as PostgreSQL `timestamptz` in UTC.
- Business timezone is `Asia/Jakarta`.
- Convert to WIB only for display and business-day resolution.
- Server clock must be synchronized by host operating system in non-local environments.
- Never accept client timestamp as official event time.
- Store schedule/rule version or snapshot used to calculate status.
- Use half-open date ranges `[start, end)` for report filters to avoid boundary ambiguity.

## 8. Attendance + MinIO consistency pattern

PostgreSQL and MinIO do not share a distributed transaction. Implement a safe staged workflow:
1. Authenticate and authorize actor.
2. Validate request and image metadata.
3. Generate server-side object key: `{username}/{kategori}/{uuid}.jpg` — kategori `datang` (absen masuk), `pulang` (absen pulang), `izin` (pergerakan izin); username divalidasi charset aman di boundary, UUID tetap acak untuk nama file.
4. Upload object to a private MinIO bucket.
5. In a PostgreSQL transaction, insert attendance event, evidence metadata, idempotency record, and audit record.
6. If DB transaction fails, attempt compensating deletion of uploaded object.
7. If deletion fails, record an orphan/reconciliation task and log object key without personal data.
8. A periodic/manual reconciliation command identifies orphaned objects and missing objects.
9. Do not report success until the database transaction commits and object existence is verified as required.

Alternative transactional outbox may be introduced only if justified; do not add a queue for MVP without need.

## 9. Authentication/session design

- Opaque random session identifier in `HttpOnly`, `SameSite=Lax` cookie; `Secure` in HTTPS environments.
- Store only a hash of session token in database.
- Rotate session after login and privilege changes.
- Logout revokes server-side session.
- Validate account active status on every authenticated request or via short-lived cache with invalidation.
- CSRF token/origin checks for cookie-authenticated state-changing requests.
- Password hashing: Argon2id with parameters benchmarked on target environment.
- Do not store long-lived access tokens in localStorage.
- Password reset flow requires a secure admin-issued or verified one-time token; never reveal whether an account exists.

## 10. API conventions

- Prefix: `/api/v1`.
- JSON request/response except multipart upload and file download.
- Stable error envelope with `code`, `message`, `requestId`, optional `fieldErrors`.
- ISO-8601 UTC timestamps in API responses.
- Pagination: `page`, `pageSize`; default 15, maximum 100 unless endpoint-specific.
- Filter and sort allowlists only.
- Search has max length and server-side debounce is a UI concern.
- Export endpoints must apply the same permission/scope filters as list endpoints.
- Idempotency key required for attendance and other retry-sensitive commands.
- Never expose internal stack traces.

## 11. Local Docker services

- `web`: frontend app (nginx serving the Vite build, proxying `/api`).
- `api`: backend API.
- `api-migrate`: one-shot `prisma migrate deploy` + seed before the API starts.
- `db`: PostgreSQL.
- `minio`: object storage.
- `minio-init`: one-shot bucket/policy setup using `infra/scripts/minio-init.mjs` and the bind-mounted static `mc` binary (`infra/bin/mc`, gitignored, downloaded host-side from the minio/mc GitHub releases; `dl.min.io` no longer serves binaries).

Use named volumes for PostgreSQL and MinIO. Health checks must gate API startup and migration/seed execution. Ports bind to `127.0.0.1`. Host ports in this environment (set via `.env`): API 3002 (container 3000), web 5174 (nginx 80), PostgreSQL 5433, MinIO API 9002 / console 9003 — remapped because another local stack occupies 3000/5173/5432/9000/9001. Host-dev mode (`pnpm --filter api dev` + vite) uses API_PORT=3000 and the vite proxy to 127.0.0.1:3000.

## 12. Environment variables

Maintain `.env.example` with placeholders for:
- `NODE_ENV`
- `APP_URL`
- `API_PORT`
- `WEB_PORT`
- `DB_HOST_PORT`, `MINIO_HOST_PORT`, `MINIO_CONSOLE_HOST_PORT` (host port remapping)
- `DATABASE_URL`
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` (initdb credentials)
- `SESSION_SECRET`
- `COOKIE_SECURE`
- `CORS_ORIGIN`
- `MINIO_ENDPOINT`
- `MINIO_PORT`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `MINIO_BUCKET_ATTENDANCE`
- `MINIO_BUCKET_HELP`
- `MINIO_USE_SSL`
- `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` (MinIO root; app uses a least-privilege service user created by minio-init)
- `BOOTSTRAP_ADMIN_USERNAME`
- `BOOTSTRAP_ADMIN_PASSWORD`
- `LOG_LEVEL`

Do not put actual credentials in `.env.example`. Validate required environment variables at startup and fail fast with a safe message.

## 13. Observability

- Structured JSON logs.
- Request/correlation ID.
- Health endpoint `/health/live` and `/health/ready`.
- Readiness checks database and MinIO dependencies.
- No secrets, passwords, selfie bytes, signed URLs, or precise coordinates in logs.
- Local logs may be console-only; production logging stack is outside current scope.

## 14. Performance and scale

- Server-side pagination and filtering.
- Index based on query patterns.
- Avoid N+1.
- Aggregate dashboard/report queries in database.
- Limit upload size and image dimensions.
- Use lazy route loading.
- Establish concurrency target only after participant count and attendance window are confirmed.
- Load test before pilot/production.

## 15. Architecture constraints

- No microservices.
- No production deployment in this phase.
- No external integrations in MVP.
- No public object storage.
- No client-side authorization as enforcement.
- No hardcoded work hours in application logic.
