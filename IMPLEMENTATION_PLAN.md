# IMPLEMENTATION PLAN — Build From Zero

## Rules

- Do not implement all modules in one giant pass.
- Each phase has an exit gate.
- A phase is not complete until tests and evidence are recorded in `BUILD_LOG.md` (repo root).
- Do not start UI polish before the backend foundation and contracts are stable.
- Do not seed real personal data.

## Phase 0 — Repository and environment audit
- Inspect empty/non-empty repository.
- Confirm Node, pnpm, Docker, Compose, ports, disk.
- Initialize Git if absent only after checking.
- Create `BUILD_LOG.md` (repo root).
- Record architecture choices and unresolved questions.

Exit: environment report exists; no existing work overwritten.

## Phase 1 — Monorepo and Docker foundation
- Initialize pnpm workspace.
- Create web and API skeletons.
- Create Dockerfiles and Compose.
- Add PostgreSQL and MinIO with named volumes and health checks.
- Add `.env.example`, `.gitignore`, `.dockerignore`.
- Add health endpoints.
- Add README setup commands.

Exit: clean Docker start; web/API reachable; DB and MinIO healthy; data persists after restart.

## Phase 2 — Database and backend foundation
- Implement Prisma schema and initial migrations.
- Add deterministic development seed.
- Add validation, error mapping, request IDs, structured logging.
- Add repository/service patterns and module boundaries.
- Add migration and architecture tests. (Status 2026-11-22: migration from empty DB verified; architecture boundary tests BELUM DIOTOMASI — direncanakan; verifikasi saat ini = typecheck strict + lint + review manual batas modul.)

Exit: migrate from empty DB; seed idempotently; lint/typecheck/build pass.

## Phase 3 — Authentication and access control
- Implement password hashing and server-side sessions.
- Implement login/logout/me/change password.
- Implement account status and session revocation.
- Implement RBAC, ABAC, ReBAC evaluator.
- Implement role/permission/feature tree admin APIs.
- Add negative authorization tests.

Exit: all auth and authorization security tests pass; no frontend-only enforcement.

## Phase 4 — Master data and scheduling
- Organizations, divisions, placements.
- Participant/supervisor profiles and assignments.
- Schedules, calendar, effective dates, schedule resolution.
- Master data audit.
- Seed minimal fake organizations, schedules, roles, and users.

Exit: schedule resolution tests pass; conflicts validated; historical snapshot strategy works.

## Phase 5 — File storage and attendance backend
- MinIO private bucket initialization.
- File validation and image processing.
- Authorized file retrieval.
- Check-in/out services, idempotency, transactions, schedule rules.
- Reconciliation for orphan objects.
- Unit/integration/API tests.

Exit: attendance API works with private evidence; duplicate and failure cases tested.

## Phase 6 — Leave workflow
- Request, approve, reject, cancel.
- Departure, return, early checkout.
- Needs-review handling.
- Audit and state transition concurrency.
- Tests for invalid transitions.

Exit: all leave state transitions tested and no automatic fabricated checkout.

## Phase 7 — Frontend participant experience
- Login and dashboard.
- Camera/location capture flow.
- Check-in/out.
- Leave request and detail.
- History/timeline.
- Help center.
- Responsive and error states.

Exit: participant E2E workflows pass on desktop automation; manual camera/GPS device tests documented. (Status 2026-11-22: E2E terotomasi BELUM DIOTOMASI — direncanakan; verifikasi saat ini = test API inject + uji browser Playwright ad-hoc di luar repo; uji perangkat kamera/GPS nyata menunggu pilot.)

## Phase 8 — Supervisor and admin experience
- Supervisor dashboard and assigned participant list.
- Admin dashboard and monitoring.
- Approval queue.
- Correction workflow.
- Data Master.
- Access control UI.
- Help center management.

Exit: role/scope E2E tests pass; no unauthorized navigation or API access. (Status 2026-11-22: negatif otorisasi terverifikasi via test API; E2E browser terotomasi BELUM DIOTOMASI — verifikasi saat ini = uji browser ad-hoc per role.)

## Phase 9 — Reports and exports
- Server-side filters and pagination.
- Aggregations.
- CSV/XLSX export.
- Scope enforcement and audit.
- No double counting.

Exit: report metric tests and export scope tests pass.

## Phase 10 — Hardening and clean-room run
- Full lint/typecheck/unit/integration/E2E/security tests. (Status 2026-11-22: lint/typecheck/unit/integration/API hijau; E2E terotomasi BELUM DIOTOMASI — direncanakan.)
- Dependency audit and secret scan. (BELUM DIOTOMASI — direncanakan; verifikasi saat ini = review manual dependensi ter-pin + `.env` gitignored + placeholder `.env.example`.)
- Docker clean start.
- Migration and seed from empty volumes.
- Verify persistent volumes.
- Verify documented reset process.
- Fix P0/P1 and all regressions.

Exit: clean-room report with exact commands, results, known limitations, and unresolved policy decisions.

## Final deliverables

- Working local Docker application.
- Source code and lockfile.
- Database migrations and fake seed.
- OpenAPI documentation.
- README setup/troubleshooting.
- Test suites and test report.
- Security checklist.
- `BUILD_LOG.md` (repo root).
- List of pending KCIC policy decisions.


## Mandatory cross-phase controls

- Update `REQUIREMENTS_TRACEABILITY.md` throughout all phases.
- Add a preflight/doctor command and operational scripts.
- Add architecture boundary tests and dependency/secret scanning. (BELUM DIOTOMASI per 2026-11-22 — direncanakan; verifikasi saat ini = review manual + typecheck/lint/test.)
- Add local backup/restore scripts and verify them before clean-room completion.
- Add Windows-friendly instructions because local development may run on Windows/Docker Desktop.
