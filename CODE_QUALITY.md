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

- Typed API client generated or checked against OpenAPI.
- Shared error handling.
- Loading/error/empty/success/permission-denied states.
- Accessible forms and dialogs.
- No fake buttons or placeholder success.
- No secret or privileged credential in browser bundle.

## Automated checks

At minimum: formatter, lint, typecheck, unit tests, integration tests, API tests, E2E, architecture boundary tests, dependency audit, secret scan, production build.
