# CODE QUALITY — Engineering Standards

## TypeScript

- Strict mode enabled.
- Avoid `any`; justify unavoidable boundaries.
- Validate untrusted input at runtime.
- Prefer discriminated unions for domain states.
- Do not use non-null assertions to hide uncertainty.

## Layering

- Route/controller: HTTP translation only.
- Application service: use-case orchestration.
- Domain: business rules and state transitions.
- Repository: persistence queries.
- Infrastructure: database, MinIO, logging, clock, crypto.
- UI: presentation and interaction; never source of truth for policy.

## Error handling

- Typed domain/application errors.
- Centralized HTTP mapping.
- Stable machine-readable error codes.
- No empty catch blocks.
- No swallowed promise rejections.
- Do not return stack traces to clients.

## Maintainability

- Feature-oriented folders.
- No circular imports.
- No cross-module private repository imports.
- Keep components/services cohesive.
- Suggested review thresholds: review files over 250 lines; refactor or document justified exceptions over 400 lines. Do not split artificially.
- Avoid duplicate validation and business logic.
- Avoid hidden side effects in UI components.

## Database quality

- Explicit migrations.
- Foreign keys and uniqueness constraints.
- Transaction boundaries documented.
- Query plans reviewed for report/list paths.
- No N+1.
- Pagination and filtering server-side.
- Indexes tied to actual query patterns.

## Frontend quality

- Typed API client: hand-written client in `apps/web/src/lib/api.ts` + `types.ts`. Generated/OpenAPI-checked client BELUM DIOTOMASI — direncanakan; verifikasi saat ini = typecheck strict + 24 unit test web (`src/lib/*.test.ts`) terhadap envelope/error mapping/CSRF.
- Shared error handling.
- Loading/error/empty/success/permission-denied states.
- Accessible forms and dialogs.
- No fake buttons or placeholder success.
- No secret or privileged credential in browser bundle.

## Automated checks

Yang berjalan hari ini (2026-11-22):
- Lint: `.eslintrc.cjs` di kedua app (eslint 8 + @typescript-eslint 8 + react-hooks); `pnpm --filter api lint`, `pnpm --filter web lint`, `--max-warnings 0`.
- Typecheck: `pnpm typecheck` (tsc strict, kedua app).
- Unit + integration + API tests: `pnpm test` — API 38 (29 integrasi + 9 unit, DB `attendance_test` dibuat ulang per run), web 24 unit.
- Production build: `pnpm build` (web: tsc + vite build).

BELUM DIOTOMASI — direncanakan (verifikasi saat ini = review manual + typecheck/lint/test di atas):
- Formatter (belum ada konfigurasi/script formatter).
- E2E suite (tidak ada `test:e2e`/Playwright di repo; uji browser ad-hoc di luar repo).
- Architecture boundary tests.
- Dependency audit.
- Secret scan (`.env` gitignored; placeholder di `.env.example`; belum ada scanner terotomasi).
