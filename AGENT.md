# AGENT — Operating Rules for Coding Agents

## 1. Mission

Build the PT KCIC Presensi Magang KCIC web application from an empty repository, using the project documents as the source of truth. Deliver a working, tested, Dockerized local application—not a static mockup.

## 2. Mandatory reading order

1. `README.md`
2. `PRD.md`
3. `DECISIONS.md`
4. `ARCHITECTURE.md`
5. `DATA_MODEL.md`
6. `API_CONTRACT.md`
7. `SECURITY.md`
8. `DESIGN.md`
9. `TESTING.md`
10. `IMPLEMENTATION_PLAN.md`

If documents conflict, stop the affected work, document the conflict, and do not silently invent a business rule. Security constraints take precedence over convenience.

## 3. First action: repository reconnaissance

Before creating or modifying files:
- Inspect the repository root, Git status, existing files, runtime versions, package manager, and Docker availability.
- Confirm whether the repository is truly empty.
- Do not overwrite existing user work.
- If non-empty, map existing structure and adapt without destructive rewrite.
- Record findings in `BUILD_LOG.md` (root, not `docs/`).
- Confirm available disk space and ports needed by Docker.
- Do not ask the user to repeat information already specified in project documents.

## 4. Architecture rules

- Use a Modular Monolith. Do not create microservices.
- Keep frontend and backend as separate deployable applications in one repository.
- Backend owns all business rules, validation, authorization, time calculation, and data integrity.
- Frontend is not a security boundary.
- Modules communicate through explicit public interfaces/facades; no deep cross-module imports.
- No circular dependencies.
- No giant controllers, route files, page components, or god services.
- Use DTO/schema validation at API boundaries.
- Use database constraints and transactions as the final integrity guard.
- Do not duplicate business rules in frontend.
- Do not put secrets or privileged storage credentials in browser code.
- Do not add features outside MVP without documenting the reason and asking for approval.

## 5. Mandatory implementation behavior

For every feature:
1. Trace its PRD requirement and acceptance criteria.
2. Define data model and migration.
3. Define permission(s) and scope.
4. Define API contract and validation.
5. Implement service/business logic.
6. Implement repository/data access.
7. Implement UI states and error states.
8. Add unit/integration/E2E tests appropriate to risk.
9. Run tests and record exact command/result.
10. Update docs and build log.

Never:
- Build a frontend-only fake feature.
- Return hardcoded success for an unimplemented API.
- Use mock data in production code paths.
- swallow exceptions or hide failing tests.
- skip authorization because UI hides a button.
- use client timestamp as official attendance time.
- use a public MinIO bucket.
- use localStorage for long-lived session secrets.
- claim completion without running the required verification.

## 6. Code organization and maintainability

- Prefer feature/module-based structure over generic dumping folders.
- Keep UI components presentational where practical; put stateful workflows in hooks/services.
- Keep controllers thin: parse request, call service, map response.
- Keep business logic in domain/application services.
- Keep SQL/ORM access in repositories.
- Keep schemas/DTOs explicit.
- Suggested review thresholds (guidance, not artificial splitting):
  - UI component/page: aim 100–200 lines.
  - Controller/route handler: aim 50–150 lines.
  - Service: aim 100–200 lines.
  - Utility: aim 30–100 lines.
  - Above 250 lines: review cohesion and split if meaningful.
  - Above 400 lines: refactor or document a justified exception.
- Do not split code into tiny files solely to satisfy line counts.
- Add architecture tests for forbidden imports and circular dependencies.

## 7. Backend requirements

- Validate params, query, body, headers, content type, and file upload.
- Use typed domain errors and a centralized error mapper.
- Use parameterized queries/ORM-safe APIs.
- Implement request/correlation IDs.
- Implement structured logs with sensitive-data redaction.
- Implement pagination/filter/sort on the server.
- Use transactions for multi-row business operations.
- Add idempotency handling for attendance and other retryable commands.
- Use optimistic concurrency/version checks where appropriate.
- Ensure every list, detail, export, download, update, and delete query applies authorization scope.

## 8. Frontend requirements

- Mobile-first responsive UI.
- Route-level lazy loading.
- Reusable components with accessible labels and focus states.
- Every screen includes loading, error, empty, success, and permission-denied states as applicable.
- Do not show success until server confirms persistence.
- Prevent accidental double submit, but rely on backend idempotency too.
- Camera and location failures must have actionable recovery guidance.
- Do not show sensitive fields or evidence outside authorized views.

## 9. Database and migration rules

- Migrations are the only supported schema change mechanism.
- Never rely on ORM auto-sync in shared environments.
- Every migration must have a safe rollback strategy or explain why it is irreversible.
- Seed data must be deterministic and idempotent.
- Seed only fake development data.
- Enforce foreign keys, unique constraints, check constraints, and indexes.
- Do not hard-delete records with historical references unless explicitly approved.
- Test migrations from an empty database and from the previous migration state.

## 10. Docker/local rules

- The complete MVP development stack must start with documented Docker Compose commands.
- Bind host ports to `127.0.0.1` by default.
- PostgreSQL and MinIO data must persist in named volumes.
- Use health checks and wait for healthy dependencies before migrations/seeding.
- Use `.env` locally and commit only `.env.example`.
- Never commit actual secrets.
- Provide one-command setup and documented reset command.
- Reset must warn that it deletes local database and object-storage data.
- Do not mount Docker socket into application containers.
- Keep MinIO console local-only.

## 11. Testing and Definition of Done

A feature is done only when:
- Acceptance criteria are linked.
- Backend authorization and negative cases are tested.
- Database migrations and constraints are tested.
- UI states are implemented.
- Relevant tests pass.
- Lint/typecheck/build pass.
- No unresolved critical/high security issue is introduced.
- Docs and build log are updated.
- The agent reports exact changed files and exact test commands/results.

Before final completion, run the full verification suite from a clean Docker environment.

## 12. Agent progress reporting

Maintain `BUILD_LOG.md` (root) with:
- Date/time.
- Phase and task.
- Files created/changed.
- Commands executed.
- Test results and failures.
- Decisions/pending questions.
- Known limitations.
- Next task.

Never mark a phase complete when its exit criteria are unmet. If blocked, state the exact blocker and evidence; do not fabricate a workaround.


## 13. Requirements traceability (mandatory)

- Maintain `REQUIREMENTS_TRACEABILITY.md`.
- Every PRD requirement and acceptance criterion must map to:
  - backend module/service/API,
  - database entities/migrations,
  - frontend page/component,
  - permission(s),
  - automated test(s),
  - status and evidence.
- A requirement with no implementation or test must remain NOT DONE.
- Do not mark a whole module complete because its page renders.

## 14. Local operational readiness

- Provide deterministic scripts for first-time setup, start, stop, logs, migrate, seed, test, and reset.
- Provide a `doctor`/preflight command that checks Docker daemon, required ports, env variables, database readiness, MinIO readiness, and migration state.
- Provide a safe reset command with explicit destructive confirmation.
- Provide a local backup/restore procedure for PostgreSQL and MinIO.
- Provide a troubleshooting runbook.
- Do not expose database or MinIO ports beyond localhost.

## 15. Dependency and supply-chain rules

- Pin package manager and runtime versions.
- Commit lockfile.
- Pin container image tags; avoid `latest`.
- Run dependency audit and secret scan.
- Review licenses and abandoned/high-risk packages.
- Do not blindly apply breaking dependency upgrades.
- Record exceptions and remediation plans.

## 16. Completion report format

At completion, report:
1. Implemented modules and linked requirement IDs.
2. Local startup instructions.
3. Seed account creation mechanism (do not expose secrets in source control).
4. Exact commands executed and exit codes.
5. Test counts and failures.
6. Docker service health.
7. Migration/seed clean-room results.
8. Known limitations and pending KCIC policy decisions.
9. Security findings and unresolved risks.
10. Files changed and next steps.
