# DATA MODEL — Database Design Baseline

> This is a logical model. The coding agent must convert it into Prisma models and migrations, validate constraints, and document any necessary refinement before implementation.

## 1. Design principles

- UUID primary keys.
- `created_at`, `updated_at` on mutable entities.
- `timestamptz` for instants; dates for business dates.
- UTC storage; WIB presentation.
- Foreign keys and unique/check constraints for integrity.
- Soft deactivation for master entities referenced by history.
- Never rely only on frontend validation.
- Historical records preserve snapshots/references to rules used.

## 2. Core entities

### Identity and access
- `users`: id, username, password_hash, display_name, email nullable, phone nullable, account_status, must_change_password, last_login_at.
- `roles`: id, code unique, name, description, is_system, status.
- `permissions`: id, code unique, module, action, description.
- `role_permissions`: role_id, permission_id, effect (`ALLOW`/`DENY`).
- `user_role_assignments`: user_id, role_id, valid_from, valid_to, assigned_by.
- `feature_nodes`: id, parent_id, code unique, label, route, node_type.
- `user_permission_overrides`: user_id, permission_id, effect, scope_json, valid_from, valid_to, reason, granted_by.
- `sessions`: id, user_id, token_hash unique, expires_at, revoked_at, last_seen_at, user_agent_hash, ip_hash nullable.
- `password_reset_tokens`: id, user_id, token_hash, expires_at, consumed_at.

### Organization and relationship
- `bureaus`: id, code unique, name, status.
- `divisions`: id, bureau_id, code, name, status; unique `(bureau_id, code)`.
- `placements`: id, code, name, description, status.
- `intern_profiles`: id, user_id unique, participant_number unique, bureau_id, division_id, placement_id, start_date, end_date, status.
- `supervisor_assignments`: id, supervisor_user_id, intern_profile_id, valid_from, valid_to, status, created_by.
- `admin_scopes`: id, user_id, scope_type, scope_id, valid_from, valid_to.

### Scheduling
- `work_schedules`: id, name, scope_type, scope_id nullable, valid_from, valid_to, timezone, status, version.
- `work_schedule_days`: id, schedule_id, weekday, is_working_day, start_time, end_time, late_tolerance_minutes.
- `calendar_days`: id, calendar_date, day_type (`HOLIDAY`, `WORKING_EXCEPTION`, `NORMAL`), name, source, status.
- `schedule_assignments`: id, schedule_id, target_type, target_id, valid_from, valid_to, priority.
- `resolved_workdays` or immutable `workday_snapshots`: intern_profile_id, work_date, resolved schedule snapshot, resolution source, status.

### Attendance and evidence
- `attendance_days`: id, intern_profile_id, work_date, check_in_event_id nullable, check_out_event_id nullable, day_status, schedule_snapshot_json, correction_flag.
- `attendance_events`: id, attendance_day_id, event_type (`CHECK_IN`, `CHECK_OUT`), occurred_at_server, client_submitted_at nullable (untrusted, diagnostic only), latitude, longitude, accuracy_meters, evidence_id, idempotency_key, status, created_by.
- `file_objects`: id, bucket, object_key unique, mime_type, size_bytes, checksum_sha256, width, height, uploaded_by, created_at, status.
- Unique constraint: one `CHECK_IN` and one `CHECK_OUT` per attendance day.
- Unique idempotency scope: actor + operation + key.
- Latitude range `[-90,90]`, longitude `[-180,180]`, accuracy positive and bounded by validation.

### Leave
- `leave_categories`: id, code unique, name, status.
- `leave_requests`: id, intern_profile_id, leave_type (`TEMPORARY`, `EARLY_DEPARTURE`), category_id, reason, estimated_departure_at, estimated_return_at nullable, status, requested_at, decided_by, decided_at, decision_note.
- `leave_events`: id, leave_request_id, event_type (`DEPARTURE`, `RETURN`, `EARLY_CHECKOUT`), occurred_at_server, latitude, longitude, accuracy_meters, evidence_id.
- Only one active temporary leave per intern per workday, enforced transactionally and with a suitable partial unique index where supported.
- Approved early departure can create/associate a check-out event exactly once.

### Audit, help, configuration
- `audit_events`: id, actor_user_id nullable, action, object_type, object_id, before_json, after_json, reason, outcome, request_id, occurred_at.
- `business_parameters`: id, key unique, value_json, valid_from, valid_to, version, updated_by.
- `help_categories`: id, code unique, name, sort_order, status.
- `help_articles`: id, category_id, slug unique, title, body, target_roles_json, status, published_at, created_by, updated_by.
- `idempotency_records`: id, actor_user_id, operation, idempotency_key, request_hash, response_status, response_body_json, expires_at.

## 3. Required constraints and indexes

At minimum:
- Unique username.
- Unique participant number.
- Unique role/permission codes.
- Unique `(bureau_id, division_code)`.
- Unique `(attendance_day_id, event_type)`.
- Unique idempotency `(actor_user_id, operation, idempotency_key)`.
- Index attendance by `(intern_profile_id, work_date DESC)`.
- Index attendance by `(work_date, day_status)`.
- Index leave by `(status, requested_at DESC)`.
- Index supervisor assignments by `(supervisor_user_id, valid_from, valid_to)`.
- Index audit by `(object_type, object_id, occurred_at DESC)` and `(actor_user_id, occurred_at DESC)`.
- Index schedule effective date/scope lookup.
- Foreign keys on all relationships.
- Check constraints for valid coordinates, positive file size, valid date ranges, and supported status values where practical.

## 4. Data lifecycle

- User account deactivation must not delete intern profile, attendance, evidence metadata, leave, or audit history.
- Deactivating bureau/division/placement must not erase historical references.
- Use effective dates for assignments and schedules.
- Do not cascade-delete attendance, leave, evidence metadata, or audit records.
- Object deletion requires a retention-approved process and authorization; not part of ordinary CRUD.
- Seed data must be fake and reproducible.

## 5. Transaction boundaries

### Attendance submission
- Validate session, active user, workday, schedule, sequence, idempotency, coordinates, and image.
- Upload object to MinIO.
- Insert evidence metadata and attendance event/day changes in one PostgreSQL transaction.
- Persist audit/idempotency record.
- Compensate failed DB commit by deleting uploaded object; if compensation fails, mark for reconciliation.

### Leave approval
- Lock or version-check leave request.
- Verify pending status.
- Write decision, actor, timestamp, note, audit event in one transaction.
- Reject concurrent duplicate decisions.

### Leave movement
- Verify approved state and expected previous event.
- Prevent duplicate departure/return/early checkout.
- Persist movement, evidence metadata, audit, and state transition transactionally.

### Correction
- Read current value under transaction/optimistic lock.
- Require reason and permission scope.
- Preserve original event and create correction record/audit.
- Recalculate derived day status using the correct schedule snapshot.

## 6. Open modeling decisions

- Whether `attendance_days` is materialized or derived.
- Exact scope representation for admin scope and ABAC attributes.
- Whether file metadata should be generalized for all uploads.
- Retention, archival, deletion and legal hold.
- Whether a participant may have multiple concurrent placement records.
- Final username/participant-number format.
