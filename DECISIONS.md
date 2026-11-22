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
| D-025 | Login rate limit | 30 requests / 15 minutes per IP (was 10), in-memory store | Accepted 2026-11-22 (Fase 4 UX) |
| D-026 | Menu labels & mobile nav | Single-source short labels (seed FEATURE_NODES + Layout fallback); mobile bottom nav 4 primary + "Menu" sheet; desktop sidebar ≤6 primary + "Lainnya" | Accepted 2026-11-22 (Fase 4 UX) |
| D-027 | Personal history export | `GET /attendance/export` CSV, additive endpoint without schema change | Accepted 2026-11-22 (Fase 4 UX) |
| D-028 | Applicant-facing leave categories | `GET /leaves/categories` (ACTIVE only, guard `leave:request`); admin CRUD stays IT/HR-managed | Accepted 2026-11-22 (Fase 6 fix) |
| D-029 | CSRF client token source | Web client reads the readable `csrf_token` cookie on every mutation (double-submit source of truth); fetch `/auth/csrf` only when no cookie | Accepted 2026-11-22 (Fase 6 fix) |

## 2026-11-22 — Fase 4 UX change records

- **D-025 Login rate limit.** Old: 10 requests/15 min per IP. New: 30 requests/15 min per IP (`apps/api/src/modules/auth/routes.ts`). Reason/evidence: office NAT/WiFi shares one public IP; audit F-13 proved 429 lockout after 10 logins/15 min for all participants together. Brute-force remains mitigated (Argon2id, generic failure messages, audit AUTH_LOGIN_FAILED); reset-password stays 10/15 min. Affected: SECURITY.md §3, API_CONTRACT §2, BUILD_LOG Phase 3 note. Store is in-memory (per-process) — accepted for local MVP. Owner: engineering. No migration impact.
- **D-026 Single-source short menu labels + mobile bottom nav.** Old: three divergent label versions (long labels "Riwayat & Timeline", "Monitoring Absensi", "Report & Statistik" in seed vs Layout fallback vs DESIGN.md); bottom nav = first 5 items (Admin lost Audit & Bantuan on phones). New: short labels Beranda, Absen, Izin, Izin Peserta, Riwayat, Monitoring, Approval, Laporan, Data Master, Akses, Audit, Bantuan, Profil — single source in seed FEATURE_NODES (idempotent upsert) mirrored by Layout fallback; mobile = bottom nav 4 primary + "Menu" sheet with all role items; desktop sidebar ≤6 primary + "Lainnya" group. Reason: audit F-05/F-08 (truncation at 360px, unreachable items). Affected: seed.ts, Layout.tsx, DESIGN.md §2. No schema change, no data loss; rollback = re-upsert old labels. Owner: product/engineering.
- **D-027 Personal CSV export.** Old: participants had to ask an admin for a history recap (only scoped `/reports/attendance/export`). New: additive `GET /attendance/export` — own history only (requires intern profile, 403 otherwise), CSV without photos/coordinates, audited `ATTENDANCE_EXPORT_SELF`, reuses `listAttendance` capped at 1000 rows (note: this differs from the reports export cap of 20000 `MAX_EXPORT_ROWS`; audit I-3's "same cap as reports" wording was imprecise); "Unduh CSV" button in Riwayat. Reason: audit improvement I-3 (recap for campus without admin). Affected: attendance routes, HistoryPage, API_CONTRACT §4, 2 new API tests. No schema change; backward compatible. Owner: engineering.
- **D-028 Applicant-facing leave categories.** Old: the leave request form fetched `/admin/leave-categories` (guard `admin:leave-categories:manage`), so every peserta got 403 and could never submit leave from the UI (found by Fase 6 browser test). New: additive `GET /leaves/categories` returning ACTIVE categories ordered by sortOrder (id/code/name only), guard `leave:request`; form switched to it. Reason: core PRD §8 flow must work for participants; admin CRUD unchanged. Affected: leaves/routes.ts, LeavesPage.tsx, API_CONTRACT §5, 1 new API test (200 peserta + 403 non-requester). No schema change. Owner: engineering.
- **D-029 CSRF client token source.** Old: web client cached the CSRF token in memory after fetching `/auth/csrf`; login and change-password rotate the cookie server-side, so the first mutation after login sent a stale token and failed 403 until a page reload (found by Fase 6 browser test). New: `ensureCsrfToken()` reads the readable `csrf_token` cookie first (canonical double-submit: cookie is the source of truth, also fixes multi-tab staleness); the fetch fallback remains for first visit and non-browser environments. Server validation unchanged (cookie == header + Origin allowlist). Affected: apps/web/src/lib/api.ts, 1 new web unit test. No API/schema change. Owner: engineering.

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
