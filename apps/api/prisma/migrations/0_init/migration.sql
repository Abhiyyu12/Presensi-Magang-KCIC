-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "GenericStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "Effect" AS ENUM ('ALLOW', 'DENY');

-- CreateEnum
CREATE TYPE "ScheduleScopeType" AS ENUM ('GLOBAL', 'BUREAU', 'DIVISION', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "AdminScopeType" AS ENUM ('GLOBAL', 'BUREAU', 'DIVISION');

-- CreateEnum
CREATE TYPE "CalendarDayType" AS ENUM ('NORMAL', 'HOLIDAY', 'WORKING_EXCEPTION');

-- CreateEnum
CREATE TYPE "ResolutionSource" AS ENUM ('GLOBAL', 'BUREAU', 'DIVISION', 'INDIVIDUAL', 'CALENDAR_OVERRIDE', 'NONE');

-- CreateEnum
CREATE TYPE "DayStatus" AS ENUM ('NOT_SCHEDULED', 'SCHEDULED', 'PRESENT', 'LATE', 'INCOMPLETE', 'NEEDS_REVIEW', 'EARLY_DEPARTURE_APPROVED');

-- CreateEnum
CREATE TYPE "AttendanceEventType" AS ENUM ('CHECK_IN', 'CHECK_OUT');

-- CreateEnum
CREATE TYPE "AttendanceEventStatus" AS ENUM ('VALID', 'CORRECTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "InternStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('ACTIVE', 'ORPHANED', 'DELETED');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('TEMPORARY', 'EARLY_DEPARTURE');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'DEPARTED', 'RETURNED', 'COMPLETED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "LeaveEventType" AS ENUM ('DEPARTURE', 'RETURN', 'EARLY_CHECKOUT');

-- CreateEnum
CREATE TYPE "HelpArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FeatureNodeType" AS ENUM ('GROUP', 'PAGE', 'ACTION');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" VARCHAR(128) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(32),
    "account_status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(128) NOT NULL,
    "module" VARCHAR(64) NOT NULL,
    "action" VARCHAR(64) NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "effect" "Effect" NOT NULL DEFAULT 'ALLOW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_role_assignments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMP(3),
    "assigned_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_nodes" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "code" VARCHAR(128) NOT NULL,
    "label" VARCHAR(128) NOT NULL,
    "route" VARCHAR(255),
    "node_type" "FeatureNodeType" NOT NULL DEFAULT 'PAGE',
    "required_permission_code" VARCHAR(128),
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "feature_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permission_overrides" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,
    "effect" "Effect" NOT NULL,
    "scope_json" JSONB,
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMP(3),
    "reason" TEXT NOT NULL,
    "granted_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "abac_policies" (
    "id" UUID NOT NULL,
    "code" VARCHAR(128) NOT NULL,
    "description" TEXT,
    "permission_code" VARCHAR(128) NOT NULL,
    "effect" "Effect" NOT NULL DEFAULT 'ALLOW',
    "condition_json" JSONB NOT NULL,
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "abac_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3),
    "user_agent_hash" TEXT,
    "ip_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bureaus" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bureaus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "divisions" (
    "id" UUID NOT NULL,
    "bureau_id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "divisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "placements" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "description" TEXT,
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intern_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "participant_number" VARCHAR(64) NOT NULL,
    "bureau_id" UUID NOT NULL,
    "division_id" UUID,
    "placement_id" UUID,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" "InternStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intern_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supervisor_assignments" (
    "id" UUID NOT NULL,
    "supervisor_user_id" UUID NOT NULL,
    "intern_profile_id" UUID NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMP(3),
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supervisor_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_scopes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "scope_type" "AdminScopeType" NOT NULL,
    "scope_id" UUID,
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_schedules" (
    "id" UUID NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "scope_type" "ScheduleScopeType" NOT NULL,
    "scope_id" UUID,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Jakarta',
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_schedule_days" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "is_working_day" BOOLEAN NOT NULL,
    "start_time" VARCHAR(5),
    "end_time" VARCHAR(5),
    "late_tolerance_minutes" INTEGER NOT NULL DEFAULT 15,

    CONSTRAINT "work_schedule_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_days" (
    "id" UUID NOT NULL,
    "calendar_date" DATE NOT NULL,
    "day_type" "CalendarDayType" NOT NULL,
    "name" VARCHAR(128),
    "source" VARCHAR(64),
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workday_snapshots" (
    "id" UUID NOT NULL,
    "intern_profile_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "is_working_day" BOOLEAN NOT NULL,
    "schedule_id" UUID,
    "schedule_name" TEXT,
    "start_time" VARCHAR(5),
    "end_time" VARCHAR(5),
    "late_tolerance_minutes" INTEGER,
    "resolution_source" "ResolutionSource" NOT NULL DEFAULT 'NONE',
    "calendar_day_type" "CalendarDayType",
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workday_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_days" (
    "id" UUID NOT NULL,
    "intern_profile_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "day_status" "DayStatus" NOT NULL DEFAULT 'SCHEDULED',
    "check_in_event_id" UUID,
    "check_out_event_id" UUID,
    "schedule_snapshot_json" JSONB NOT NULL,
    "leave_request_id" UUID,
    "correction_flag" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_events" (
    "id" UUID NOT NULL,
    "attendance_day_id" UUID NOT NULL,
    "event_type" "AttendanceEventType" NOT NULL,
    "occurred_at_server" TIMESTAMP(3) NOT NULL,
    "client_submitted_at" TIMESTAMP(3),
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy_meters" DOUBLE PRECISION,
    "evidence_id" UUID NOT NULL,
    "idempotency_key" TEXT,
    "status" "AttendanceEventStatus" NOT NULL DEFAULT 'VALID',
    "is_late" BOOLEAN,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_objects" (
    "id" UUID NOT NULL,
    "bucket" VARCHAR(64) NOT NULL,
    "object_key" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(64) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum_sha256" CHAR(64),
    "width" INTEGER,
    "height" INTEGER,
    "uploaded_by_id" UUID,
    "status" "FileStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_categories" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL,
    "intern_profile_id" UUID NOT NULL,
    "leave_type" "LeaveType" NOT NULL,
    "category_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "estimated_departure_at" TIMESTAMP(3) NOT NULL,
    "estimated_return_at" TIMESTAMP(3),
    "work_date" DATE NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_events" (
    "id" UUID NOT NULL,
    "leave_request_id" UUID NOT NULL,
    "event_type" "LeaveEventType" NOT NULL,
    "occurred_at_server" TIMESTAMP(3) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy_meters" DOUBLE PRECISION,
    "evidence_id" UUID NOT NULL,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" VARCHAR(128) NOT NULL,
    "object_type" VARCHAR(64) NOT NULL,
    "object_id" VARCHAR(64),
    "before_json" JSONB,
    "after_json" JSONB,
    "reason" TEXT,
    "outcome" VARCHAR(32) NOT NULL DEFAULT 'SUCCESS',
    "request_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_parameters" (
    "id" UUID NOT NULL,
    "key" VARCHAR(128) NOT NULL,
    "value_json" JSONB NOT NULL,
    "description" TEXT,
    "valid_from" TIMESTAMP(3),
    "valid_to" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_parameters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "help_categories" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "GenericStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "help_articles" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "target_roles_json" JSONB,
    "status" "HelpArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "help_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "operation" VARCHAR(64) NOT NULL,
    "idempotency_key" VARCHAR(128) NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "response_status" INTEGER NOT NULL,
    "response_body_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "permissions_module_idx" ON "permissions"("module");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_id_permission_id_key" ON "role_permissions"("role_id", "permission_id");

-- CreateIndex
CREATE INDEX "user_role_assignments_user_id_valid_from_valid_to_idx" ON "user_role_assignments"("user_id", "valid_from", "valid_to");

-- CreateIndex
CREATE UNIQUE INDEX "feature_nodes_code_key" ON "feature_nodes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "user_permission_overrides_user_id_permission_id_key" ON "user_permission_overrides"("user_id", "permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "abac_policies_code_key" ON "abac_policies"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "bureaus_code_key" ON "bureaus"("code");

-- CreateIndex
CREATE UNIQUE INDEX "divisions_bureau_id_code_key" ON "divisions"("bureau_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "placements_code_key" ON "placements"("code");

-- CreateIndex
CREATE UNIQUE INDEX "intern_profiles_user_id_key" ON "intern_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "intern_profiles_participant_number_key" ON "intern_profiles"("participant_number");

-- CreateIndex
CREATE INDEX "intern_profiles_bureau_id_division_id_idx" ON "intern_profiles"("bureau_id", "division_id");

-- CreateIndex
CREATE INDEX "intern_profiles_status_idx" ON "intern_profiles"("status");

-- CreateIndex
CREATE INDEX "supervisor_assignments_supervisor_user_id_valid_from_valid__idx" ON "supervisor_assignments"("supervisor_user_id", "valid_from", "valid_to");

-- CreateIndex
CREATE INDEX "supervisor_assignments_intern_profile_id_idx" ON "supervisor_assignments"("intern_profile_id");

-- CreateIndex
CREATE INDEX "admin_scopes_user_id_idx" ON "admin_scopes"("user_id");

-- CreateIndex
CREATE INDEX "work_schedules_scope_type_scope_id_valid_from_idx" ON "work_schedules"("scope_type", "scope_id", "valid_from");

-- CreateIndex
CREATE UNIQUE INDEX "work_schedule_days_schedule_id_weekday_key" ON "work_schedule_days"("schedule_id", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "calendar_days_calendar_date_key" ON "calendar_days"("calendar_date");

-- CreateIndex
CREATE INDEX "workday_snapshots_work_date_idx" ON "workday_snapshots"("work_date");

-- CreateIndex
CREATE UNIQUE INDEX "workday_snapshots_intern_profile_id_work_date_key" ON "workday_snapshots"("intern_profile_id", "work_date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_days_check_in_event_id_key" ON "attendance_days"("check_in_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_days_check_out_event_id_key" ON "attendance_days"("check_out_event_id");

-- CreateIndex
CREATE INDEX "attendance_days_work_date_day_status_idx" ON "attendance_days"("work_date", "day_status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_days_intern_profile_id_work_date_key" ON "attendance_days"("intern_profile_id", "work_date");

-- CreateIndex
CREATE INDEX "attendance_events_occurred_at_server_idx" ON "attendance_events"("occurred_at_server");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_events_attendance_day_id_event_type_key" ON "attendance_events"("attendance_day_id", "event_type");

-- CreateIndex
CREATE UNIQUE INDEX "file_objects_object_key_key" ON "file_objects"("object_key");

-- CreateIndex
CREATE UNIQUE INDEX "leave_categories_code_key" ON "leave_categories"("code");

-- CreateIndex
CREATE INDEX "leave_requests_status_requested_at_idx" ON "leave_requests"("status", "requested_at");

-- CreateIndex
CREATE INDEX "leave_requests_intern_profile_id_work_date_idx" ON "leave_requests"("intern_profile_id", "work_date");

-- CreateIndex
CREATE INDEX "leave_events_leave_request_id_event_type_idx" ON "leave_events"("leave_request_id", "event_type");

-- CreateIndex
CREATE INDEX "audit_events_object_type_object_id_occurred_at_idx" ON "audit_events"("object_type", "object_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_events_actor_user_id_occurred_at_idx" ON "audit_events"("actor_user_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "business_parameters_key_key" ON "business_parameters"("key");

-- CreateIndex
CREATE UNIQUE INDEX "help_categories_code_key" ON "help_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "help_articles_slug_key" ON "help_articles"("slug");

-- CreateIndex
CREATE INDEX "help_articles_status_idx" ON "help_articles"("status");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_actor_user_id_operation_idempotency_key_key" ON "idempotency_records"("actor_user_id", "operation", "idempotency_key");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_nodes" ADD CONSTRAINT "feature_nodes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "feature_nodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "divisions" ADD CONSTRAINT "divisions_bureau_id_fkey" FOREIGN KEY ("bureau_id") REFERENCES "bureaus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intern_profiles" ADD CONSTRAINT "intern_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intern_profiles" ADD CONSTRAINT "intern_profiles_bureau_id_fkey" FOREIGN KEY ("bureau_id") REFERENCES "bureaus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intern_profiles" ADD CONSTRAINT "intern_profiles_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intern_profiles" ADD CONSTRAINT "intern_profiles_placement_id_fkey" FOREIGN KEY ("placement_id") REFERENCES "placements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_assignments" ADD CONSTRAINT "supervisor_assignments_supervisor_user_id_fkey" FOREIGN KEY ("supervisor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisor_assignments" ADD CONSTRAINT "supervisor_assignments_intern_profile_id_fkey" FOREIGN KEY ("intern_profile_id") REFERENCES "intern_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_scopes" ADD CONSTRAINT "admin_scopes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_schedule_days" ADD CONSTRAINT "work_schedule_days_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "work_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workday_snapshots" ADD CONSTRAINT "workday_snapshots_intern_profile_id_fkey" FOREIGN KEY ("intern_profile_id") REFERENCES "intern_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_intern_profile_id_fkey" FOREIGN KEY ("intern_profile_id") REFERENCES "intern_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_attendance_day_id_fkey" FOREIGN KEY ("attendance_day_id") REFERENCES "attendance_days"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "file_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_intern_profile_id_fkey" FOREIGN KEY ("intern_profile_id") REFERENCES "intern_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "leave_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_events" ADD CONSTRAINT "leave_events_leave_request_id_fkey" FOREIGN KEY ("leave_request_id") REFERENCES "leave_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_events" ADD CONSTRAINT "leave_events_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "file_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_articles" ADD CONSTRAINT "help_articles_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "help_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Supplementary constraints (DATA_MODEL §3): one active TEMPORARY leave per intern per workday; coordinate/size bounds.
CREATE UNIQUE INDEX "leave_requests_one_active_temporary" ON "leave_requests" ("intern_profile_id", "work_date") WHERE "leave_type" = 'TEMPORARY' AND "status" IN ('PENDING','APPROVED','DEPARTED','RETURNED');
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_lat_range" CHECK ("latitude" >= -90 AND "latitude" <= 90);
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_lng_range" CHECK ("longitude" >= -180 AND "longitude" <= 180);
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_size_positive" CHECK ("size_bytes" > 0);
