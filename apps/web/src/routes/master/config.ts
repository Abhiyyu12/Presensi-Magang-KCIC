import { z, type ZodTypeAny } from 'zod';

export interface FieldConfig {
  name: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'textarea';
  required?: boolean;
  min?: number;
  options?: { value: string; label: string }[];
  /** Only shown on create, not on edit (e.g. username). */
  createOnly?: boolean;
}

export interface ColumnConfig {
  header: string;
  field?: string;
  render?: (row: Record<string, unknown>) => string;
}

export interface ResourceConfig {
  key: string;
  label: string;
  path: string;
  columns: ColumnConfig[];
  fields: FieldConfig[];
  /** Whether rows support an isActive toggle via PATCH. */
  hasActiveToggle?: boolean;
  /** Row field used as display name for select references. */
  nameLabel?: string;
}

export function buildSchema(fields: FieldConfig[], mode: 'create' | 'edit'): z.ZodObject<z.ZodRawShape> {
  const shape: Record<string, ZodTypeAny> = {};
  for (const field of fields) {
    if (mode === 'edit' && field.createOnly) continue;
    if (field.type === 'number') {
      let schema: z.ZodTypeAny = z.coerce.number({ invalid_type_error: `${field.label} harus berupa angka.` });
      if (field.required) {
        schema = schema.refine((v) => !Number.isNaN(v), `${field.label} wajib diisi.`);
      } else {
        shape[field.name] = z.union([schema, z.literal('')]);
        continue;
      }
      shape[field.name] = schema;
      continue;
    }
    let schema = z.string();
    if (field.required) schema = schema.min(1, `${field.label} wajib diisi.`);
    if (field.min && field.min > 1) schema = schema.min(field.min, `${field.label} minimal ${field.min} karakter.`);
    shape[field.name] = field.required ? schema : schema.optional().or(z.literal(''));
  }
  return z.object(shape);
}

export const MASTER_RESOURCES: ResourceConfig[] = [
  {
    key: 'bureaus',
    label: 'Biro',
    path: '/admin/organizations/bureaus',
    hasActiveToggle: true,
    columns: [
      { header: 'Nama', field: 'name' },
      { header: 'Kode', field: 'code' },
      { header: 'Status', render: (row) => (row['isActive'] === false ? 'Nonaktif' : 'Aktif') },
    ],
    fields: [
      { name: 'name', label: 'Nama biro', type: 'text', required: true },
      { name: 'code', label: 'Kode', type: 'text' },
      { name: 'isActive', label: 'Aktif (true/false)', type: 'select', options: [{ value: 'true', label: 'Aktif' }, { value: 'false', label: 'Nonaktif' }] },
    ],
  },
  {
    key: 'divisions',
    label: 'Divisi',
    path: '/admin/organizations/divisions',
    hasActiveToggle: true,
    columns: [
      { header: 'Nama', field: 'name' },
      { header: 'Biro', field: 'bureauName' },
      { header: 'Status', render: (row) => (row['isActive'] === false ? 'Nonaktif' : 'Aktif') },
    ],
    fields: [
      { name: 'name', label: 'Nama divisi', type: 'text', required: true },
      { name: 'bureauId', label: 'ID Biro', type: 'text' },
      { name: 'isActive', label: 'Aktif (true/false)', type: 'select', options: [{ value: 'true', label: 'Aktif' }, { value: 'false', label: 'Nonaktif' }] },
    ],
  },
  {
    key: 'placements',
    label: 'Penempatan',
    path: '/admin/placements',
    columns: [
      { header: 'Nama', field: 'name' },
      { header: 'Divisi', field: 'divisionName' },
      { header: 'Berlaku dari', field: 'validFrom' },
      { header: 'Berlaku sampai', field: 'validTo' },
    ],
    fields: [
      { name: 'name', label: 'Nama penempatan', type: 'text', required: true },
      { name: 'divisionId', label: 'ID Divisi', type: 'text' },
      { name: 'validFrom', label: 'Berlaku dari', type: 'date', required: true },
      { name: 'validTo', label: 'Berlaku sampai', type: 'date' },
    ],
  },
  {
    key: 'intern-profiles',
    label: 'Peserta',
    path: '/admin/intern-profiles',
    columns: [
      { header: 'Nama', field: 'fullName' },
      { header: 'Nomor peserta', field: 'participantNumber' },
      { header: 'Biro', field: 'bureauName' },
      { header: 'Divisi', field: 'divisionName' },
    ],
    fields: [
      { name: 'fullName', label: 'Nama lengkap', type: 'text', required: true },
      { name: 'participantNumber', label: 'Nomor peserta', type: 'text', required: true },
      { name: 'bureauId', label: 'ID Biro', type: 'text' },
      { name: 'divisionId', label: 'ID Divisi', type: 'text' },
      { name: 'startDate', label: 'Tanggal mulai magang', type: 'date' },
      { name: 'endDate', label: 'Tanggal selesai magang', type: 'date' },
    ],
  },
  {
    key: 'assignments',
    label: 'Penugasan',
    path: '/admin/assignments',
    columns: [
      { header: 'Jenis relasi', field: 'assignmentType' },
      { header: 'Pengguna', field: 'userName' },
      { header: 'Target', field: 'targetName' },
      { header: 'Berlaku dari', field: 'validFrom' },
    ],
    fields: [
      { name: 'assignmentType', label: 'Jenis (mis. SUPERVISOR_INTERN)', type: 'text', required: true },
      { name: 'userId', label: 'ID Pengguna', type: 'text', required: true },
      { name: 'targetType', label: 'Tipe target (mis. INTERN_PROFILE)', type: 'text' },
      { name: 'targetId', label: 'ID Target', type: 'text' },
      { name: 'validFrom', label: 'Berlaku dari', type: 'date', required: true },
      { name: 'validTo', label: 'Berlaku sampai', type: 'date' },
    ],
  },
  {
    key: 'scopes',
    label: 'Cakupan (Scope)',
    path: '/admin/scopes',
    columns: [
      { header: 'Nama', field: 'name' },
      { header: 'Tipe', field: 'scopeType' },
    ],
    fields: [
      { name: 'name', label: 'Nama scope', type: 'text', required: true },
      { name: 'scopeType', label: 'Tipe (mis. BUREAU/DIVISION)', type: 'text', required: true },
      { name: 'scopeId', label: 'ID objek scope', type: 'text' },
    ],
  },
  {
    key: 'calendar',
    label: 'Kalender',
    path: '/admin/calendar',
    columns: [
      { header: 'Tanggal', field: 'date' },
      { header: 'Jenis', field: 'dayType' },
      { header: 'Keterangan', field: 'name' },
    ],
    fields: [
      { name: 'date', label: 'Tanggal', type: 'date', required: true },
      { name: 'dayType', label: 'Jenis hari (mis. HOLIDAY/WORKDAY)', type: 'text', required: true },
      { name: 'name', label: 'Keterangan', type: 'text' },
    ],
  },
  {
    key: 'leave-categories',
    label: 'Kategori Izin',
    path: '/admin/leave-categories',
    hasActiveToggle: true,
    columns: [
      { header: 'Nama', field: 'name' },
      { header: 'Status', render: (row) => (row['isActive'] === false ? 'Nonaktif' : 'Aktif') },
    ],
    fields: [
      { name: 'name', label: 'Nama kategori', type: 'text', required: true },
      { name: 'isActive', label: 'Aktif (true/false)', type: 'select', options: [{ value: 'true', label: 'Aktif' }, { value: 'false', label: 'Nonaktif' }] },
    ],
  },
  {
    key: 'business-parameters',
    label: 'Parameter',
    path: '/admin/business-parameters',
    columns: [
      { header: 'Kunci', field: 'key' },
      { header: 'Nilai', field: 'value' },
      { header: 'Keterangan', field: 'description' },
    ],
    fields: [
      { name: 'key', label: 'Kunci parameter', type: 'text', required: true, createOnly: true },
      { name: 'value', label: 'Nilai', type: 'text', required: true },
      { name: 'description', label: 'Keterangan', type: 'textarea' },
    ],
  },
];
