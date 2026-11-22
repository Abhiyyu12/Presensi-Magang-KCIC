// Shared API response types. The backend is the source of truth for business
// rules; these types only describe transport shapes for rendering.

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  items: T[];
  pagination: Pagination;
}

export interface RoleRef {
  id: string;
  code: string;
  name?: string;
}

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  accountStatus: string;
  mustChangePassword: boolean;
  roles: RoleRef[];
  permissions: string[];
  internProfileId?: string | null;
}

export interface FeatureNode {
  code: string;
  label: string;
  route?: string | null;
  nodeType?: string;
  children?: FeatureNode[];
}

export interface EffectiveAccess {
  roles: string[];
  permissions: string[];
  denied?: string[];
  featureTree: FeatureNode[];
}

export type EventType = 'CHECK_IN' | 'CHECK_OUT';

export interface AttendanceEvent {
  id: string;
  eventType: EventType | string;
  occurredAtServer: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  isLate?: boolean | null;
  status?: string | null;
  evidenceId?: string | null;
}

export interface ScheduleSnapshot {
  startTime?: string | null;
  endTime?: string | null;
  lateToleranceMinutes?: number | null;
  isWorkingDay?: boolean;
}

export interface AttendanceDay {
  id: string;
  workDate: string;
  dayStatus: string;
  correctionFlag: boolean;
  events: AttendanceEvent[];
  scheduleSnapshot?: ScheduleSnapshot | null;
  participantName?: string;
  participantNumber?: string;
  bureau?: string;
  division?: string;
}

export interface Workday {
  isWorkingDay: boolean;
  startTime?: string | null;
  endTime?: string | null;
  lateToleranceMinutes?: number | null;
}

export interface LeaveEvent {
  id: string;
  eventType: string;
  occurredAtServer?: string;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  evidenceId?: string | null;
  note?: string | null;
}

export interface Leave {
  id: string;
  leaveType: 'TEMPORARY' | 'EARLY_DEPARTURE' | string;
  status: string;
  reason?: string;
  categoryId?: string | null;
  categoryName?: string | null;
  estimatedDepartureAt?: string | null;
  estimatedReturnAt?: string | null;
  participantName?: string;
  participantNumber?: string;
  bureau?: string;
  division?: string;
  createdAt?: string;
  decisionNote?: string | null;
  events?: LeaveEvent[];
}

export interface TodayResponse {
  serverTime: string;
  workDate: string;
  workday: Workday | null;
  attendanceDay: AttendanceDay | null;
  activeLeave: Leave | null;
}

export interface CheckResult {
  attendanceDayId: string;
  eventId: string;
  eventType: EventType | string;
  occurredAtServer: string;
  workDate: string;
  dayStatus: string;
  isLate: boolean;
}

export interface LeaveCategory {
  id: string;
  name: string;
  code?: string;
  isActive?: boolean;
}

export interface ReportMetrics {
  terjadwal: number;
  hadir: number;
  tepatWaktu: number;
  terlambat: number;
  lengkap: number;
  belumLengkap: number;
  tidakAdaCatatan: number;
  izinPending: number;
  sedangIzin: number;
  sudahKembali: number;
  perluReview: number;
  pulangAwal: number;
  koreksi: number;
}

export interface ReportRow {
  workDate: string;
  participantNumber: string;
  participantName: string;
  bureau: string;
  division: string;
  checkIn?: string | null;
  checkOut?: string | null;
  dayStatus: string;
  correctionFlag: boolean;
  leaves?: Leave[];
}

export interface AuditEntry {
  id: string;
  occurredAt?: string;
  actorName?: string;
  actorUsername?: string;
  action?: string;
  objectType?: string;
  objectId?: string;
  before?: unknown;
  after?: unknown;
}

export interface HelpCategory {
  id: string;
  name: string;
  slug?: string;
}

export interface HelpArticle {
  id: string;
  slug: string;
  title: string;
  content: string;
  categoryId?: string;
  categoryName?: string;
  status?: string;
  updatedAt?: string;
}

export interface Profile {
  id: string;
  username: string;
  displayName: string;
  email?: string | null;
  phone?: string | null;
  accountStatus?: string;
}

export interface NamedEntity {
  id: string;
  name: string;
  code?: string;
  [key: string]: unknown;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asString(value: unknown, fallback = '-'): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}
