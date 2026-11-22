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
| Tests | Vitest, Supertest/inject, Playwright | Unit, integration, E2E |
| Containers | Docker Compose | Local reproducibility |

Versions must be selected as current supported stable versions at implementation time and pinned in lockfiles/image tags. Do not use floating `latest` tags. If a package is incompatible, document evidence and propose a replacement before switching.

## 3. Repository structure

```text
/
├── apps/
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── routes/
│   │   │   ├── modules/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   └── styles/
│   │   └── Dockerfile
│   └── api/
│       ├── src/
│       │   ├── app/
│       │   ├── config/
│       │   ├── common/
│       │   ├── modules/
│       │   ├── infrastructure/
│       │   └── server.ts
│       ├── prisma/
│       │   ├── schema.prisma
│       │   ├── migrations/
│       │   └── seed.ts
│       └── Dockerfile
├── packages/
│   └── contracts/
├── docs/
│   ├── BUILD_LOG.md
│   └── decisions/
├── infra/
│   ├── docker/
│   └── scripts/
├── docker-compose.yml
├── .env.example
├── .gitignore
├── .dockerignore
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
└── README.md
```

## 4. Backend module boundaries

Each module owns its routes, schemas, application services, domain rules, repositories, and tests.

- `auth`: login, logout, session, password change/reset, account status.
- `users`: user account and profile.
- `organizations`: biro, divisi, organizational hierarchy.
- `assignments`: participant-supervisor relationships and effective dates.
- `schedules`: work schedules, calendar, exceptions, schedule resolution.
- `attendance`: check-in/out, evidence orchestration, status calculation, idempotency.
- `leaves`: leave requests, approval, movement events, review state.
- `reports`: report queries, aggregation, CSV/XLSX export.
- `master-data`: configurable categories and business parameters.
- `access-control`: roles, permissions, feature tree, ABAC/ReBAC evaluation.
- `audit`: append-oriented audit events and access evidence.
- `help-center`: categories and articles.
- `files`: MinIO abstraction, upload validation, authorized retrieval.
- `notifications`: in-app badge/pending counters only for MVP.

Cross-module calls must use public application interfaces. Avoid importing another module's repository or private implementation.

## 5. Frontend module boundaries

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
3. Generate opaque server-side object key.
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

- `web`: frontend app.
- `api`: backend API.
- `db`: PostgreSQL.
- `minio`: object storage.
- `minio-init`: one-shot bucket/policy setup using local credentials.
- Optional `adminer` or database UI is not required; if added, bind to localhost and keep disabled by default.

Use named volumes for PostgreSQL and MinIO. Health checks must gate API startup and migration/seed execution. Ports bind to `127.0.0.1`.

## 12. Environment variables

Maintain `.env.example` with placeholders for:
- `NODE_ENV`
- `APP_URL`
- `API_PORT`
- `DATABASE_URL`
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
