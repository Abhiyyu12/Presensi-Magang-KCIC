# DECISIONS — Architecture and Product Decision Register

| ID | Decision | Current baseline | Status / owner |
|---|---|---|---|
| D-001 | Architecture | Modular Monolith | Accepted for MVP |
| D-002 | Runtime language | TypeScript strict | Recommended default |
| D-003 | Frontend | React + Vite | Recommended default |
| D-004 | Backend | Fastify | Recommended default |
| D-005 | Database | PostgreSQL | MVP |
| D-006 | ORM/migrations | Prisma | Recommended default; verify feature fit |
| D-007 | Object storage | MinIO private buckets | MVP local |
| D-008 | Local orchestration | Docker Compose | MVP |
| D-009 | Auth | Server-side opaque sessions + HttpOnly cookie | Security baseline |
| D-010 | API | REST `/api/v1` + OpenAPI | MVP |
| D-011 | Time | UTC storage, Asia/Jakarta display | MVP |
| D-012 | Attendance evidence | Camera capture + GPS + server time | MVP |
| D-013 | Geofence | Not used | MVP |
| D-014 | Roles | Participant, Supervisor, Admin HR, Administrator IT | Baseline |
| D-015 | Authorization | RBAC + ABAC + ReBAC, default deny | MVP |
| D-016 | IT superuser | Development bootstrap only | Security restriction |
| D-017 | Workdays | Monday-Friday default | Pending HR confirmation |
| D-018 | Late tolerance | 15 minutes configurable | Pending HR confirmation |
| D-019 | Work hours | Configured schedule; no hardcoded business value | Pending HR confirmation |
| D-020 | Leave types | Temporary and early departure | MVP |
| D-021 | Retention | Preserve history; production period pending | Pending data owner |
| D-022 | Integrations | No external integration in MVP | MVP |
| D-023 | Notifications | In-app badge/pending only | MVP |
| D-024 | Deployment | Local only; no production deployment | MVP |

## Conflict resolution from source PRD

- The source PRD allowed Administrator IT full access for testing. This is restricted to local development bootstrap/test only; it must not become a production default.
- The source PRD described indefinite retention as a default, but also called for privacy review. The implementation preserves history and does not hard-delete operational records; production retention duration requires formal approval.
- Proposed 15-minute tolerance and Monday-Friday schedule remain configurable suggestions, not confirmed KCIC policy.
- Exact official work hours are not supplied and must never be invented or hardcoded.

## Change process

Every decision change must record:
- Decision ID.
- Old and new value.
- Reason/evidence.
- Affected PRD, data model, API, UI, tests.
- Approval owner if business policy.
- Migration/backward compatibility impact.
