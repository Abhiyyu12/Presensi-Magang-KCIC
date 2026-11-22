import { z, type ZodTypeAny } from 'zod';
import { asString, isRecord } from '../../lib/types';
import {
  fetchBureauOptions,
  fetchScopeIdOptions,
  fetchUserOptions,
} from './options';

export interface ComboboxFieldConfig {
  fetchOptions: (search: string, dep: string) => Promise<{ value: string; label: string; description?: string }[]>;
  /** Field lain yang nilainya menjadi dependensi (dependent dropdown). */
  dependsOn?: string;
  serverSearch?: boolean;
  /** Sembunyikan field saat field lain bernilai salah satu dari daftar ini. */
  hideWhen?: { field: string; equals: string[] };
  /** Label awal untuk mode edit (mis. nama relasi dari baris). */
  labelFromRow?: (row: Record<string, unknown>) => string;
  /** Saat opsi terpilih membawa meta { profileStart, profileEnd }, isi otomatis dua field tanggal ini. */
  autofillDates?: { startField: string; endField: string };
}

export interface FieldConfig {
  name: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'combobox';
  required?: boolean;
  min?: number;
  options?: { value: string; label: string }[];
  /** Teks bantuan singkat di bawah input. */
  hint?: string;
  /** Only shown on create, not on edit (e.g. username). */
  createOnly?: boolean;
  combobox?: ComboboxFieldConfig;
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
  /** Whether rows support a status ACTIVE/INACTIVE toggle via PATCH. */
  hasStatusToggle?: boolean;
  /** Whether rows offer Hapus (DELETE); server menolak bila data masih dipakai. */
  hasDelete?: boolean;
  /** Map an API row onto form field values (e.g. JSON columns, ISO dates). */
  toForm?: (row: Record<string, unknown>) => Record<string, unknown>;
  /** Map the parsed form payload onto the API body; may throw ApiError. */
  toPayload?: (payload: Record<string, unknown>, mode: 'create' | 'edit') => Record<string, unknown>;
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

type Row = Record<string, unknown>;

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Aktif' },
  { value: 'INACTIVE', label: 'Nonaktif' },
];

const statusText = (row: Row): string => (row['status'] === 'INACTIVE' ? 'Nonaktif' : 'Aktif');

const SCOPE_TYPE_TEXT: Record<string, string> = {
  GLOBAL: 'Global (semua data)',
  BUREAU: 'Direktorat',
  DIVISION: 'Biro',
};

const DAY_TYPE_TEXT: Record<string, string> = {
  NORMAL: 'Normal',
  HOLIDAY: 'Libur',
  WORKING_EXCEPTION: 'Masuk khusus (pengecualian)',
};

const nestedName = (row: Row, key: string): string => {
  const value = row[key];
  return isRecord(value) ? asString(value['name'] ?? value['displayName']) : '';
};

const datePart = (value: unknown): string => (typeof value === 'string' ? value.slice(0, 10) : '');

/** API expects ISO-8601 datetime for these fields; the form yields YYYY-MM-DD. */
function withIsoDates(payload: Row, keys: string[]): Row {
  const next = { ...payload };
  for (const key of keys) {
    const raw = next[key];
    if (typeof raw === 'string' && raw !== '') next[key] = new Date(raw).toISOString();
  }
  return next;
}

export const MASTER_RESOURCES: ResourceConfig[] = [
  {
    key: 'bureaus',
    label: 'Direktorat',
    hasDelete: true,
    path: '/admin/organizations/bureaus',
    hasStatusToggle: true,
    columns: [
      { header: 'Nama', field: 'name' },
      { header: 'Kode', field: 'code' },
      { header: 'Status', render: statusText },
    ],
    fields: [
      { name: 'name', label: 'Nama direktorat', type: 'text', required: true },
      { name: 'code', label: 'Kode', type: 'text', required: true },
      { name: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
    ],
  },
  {
    key: 'divisions',
    label: 'Biro',
    hasDelete: true,
    path: '/admin/organizations/divisions',
    hasStatusToggle: true,
    columns: [
      { header: 'Nama', field: 'name' },
      { header: 'Kode', field: 'code' },
      { header: 'Direktorat', render: (row) => nestedName(row, 'bureau') },
      { header: 'Status', render: statusText },
    ],
    fields: [
      { name: 'name', label: 'Nama biro', type: 'text', required: true },
      { name: 'code', label: 'Kode', type: 'text', required: true },
      {
        name: 'bureauId',
        label: 'Direktorat',
        type: 'combobox',
        required: true,
        combobox: { fetchOptions: fetchBureauOptions, serverSearch: true, labelFromRow: (row) => nestedName(row, 'bureau') },
      },
      { name: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
    ],
  },
  {
    key: 'placements',
    label: 'Penempatan',
    hasDelete: true,
    path: '/admin/placements',
    hasStatusToggle: true,
    columns: [
      { header: 'Nama', field: 'name' },
      { header: 'Kode', field: 'code' },
      { header: 'Status', render: statusText },
    ],
    fields: [
      { name: 'name', label: 'Nama penempatan', type: 'text', required: true },
      { name: 'code', label: 'Kode', type: 'text', required: true },
      { name: 'description', label: 'Keterangan', type: 'textarea' },
      { name: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
    ],
  },
  {
    key: 'scopes',
    label: 'Cakupan (Scope)',
    hasDelete: true,
    path: '/admin/scopes',
    columns: [
      { header: 'Pengguna', render: (row) => nestedName(row, 'user') },
      { header: 'Tipe', render: (row) => SCOPE_TYPE_TEXT[asString(row['scopeType'])] ?? asString(row['scopeType']) },
      { header: 'Berlaku dari', render: (row) => datePart(row['validFrom']) },
      { header: 'Berlaku sampai', render: (row) => (row['validTo'] ? datePart(row['validTo']) : '-') },
    ],
    fields: [
      {
        name: 'userId',
        label: 'Pengguna',
        type: 'combobox',
        required: true,
        createOnly: true,
        hint: 'Tanggal berlaku terisi otomatis dari periode magang pengguna yang dipilih (bila ada) dan tetap bisa diubah.',
        combobox: {
          fetchOptions: fetchUserOptions(),
          serverSearch: true,
          labelFromRow: (row) => nestedName(row, 'user'),
          autofillDates: { startField: 'validFrom', endField: 'validTo' },
        },
      },
      {
        name: 'scopeType',
        label: 'Tipe cakupan',
        type: 'select',
        required: true,
        createOnly: true,
        hint: 'Global = boleh semua data; Direktorat = hanya data di satu direktorat; Biro = hanya data di satu biro.',
        options: [
          { value: 'GLOBAL', label: 'Global (semua data)' },
          { value: 'BUREAU', label: 'Direktorat' },
          { value: 'DIVISION', label: 'Biro' },
        ],
      },
      {
        name: 'scopeId',
        label: 'Objek cakupan (direktorat/biro)',
        type: 'combobox',
        createOnly: true,
        hint: 'Diisi hanya untuk tipe Direktorat atau Biro.',
        combobox: {
          fetchOptions: fetchScopeIdOptions,
          serverSearch: true,
          dependsOn: 'scopeType',
          hideWhen: { field: 'scopeType', equals: ['GLOBAL'] },
        },
      },
      {
        name: 'validFrom',
        label: 'Berlaku dari',
        type: 'date',
        hint: 'Cakupan hanya aktif di antara kedua tanggal ini; kosongkan "Berlaku sampai" bila tanpa batas waktu.',
      },
      { name: 'validTo', label: 'Berlaku sampai', type: 'date' },
    ],
    toForm: (row) => ({ ...row, validFrom: datePart(row['validFrom']), validTo: datePart(row['validTo']) }),
    toPayload: (payload) => withIsoDates(payload, ['validFrom', 'validTo']),
  },
  {
    key: 'calendar',
    label: 'Kalender',
    hasDelete: true,
    path: '/admin/calendar',
    columns: [
      { header: 'Tanggal', render: (row) => datePart(row['calendarDate']) },
      { header: 'Jenis', render: (row) => DAY_TYPE_TEXT[asString(row['dayType'])] ?? asString(row['dayType']) },
      { header: 'Keterangan', field: 'name' },
      { header: 'Status', render: statusText },
    ],
    fields: [
      { name: 'calendarDate', label: 'Tanggal', type: 'date', required: true, createOnly: true },
      {
        name: 'dayType',
        label: 'Jenis hari',
        type: 'select',
        required: true,
        options: [
          { value: 'NORMAL', label: 'Normal' },
          { value: 'HOLIDAY', label: 'Libur' },
          { value: 'WORKING_EXCEPTION', label: 'Masuk khusus (pengecualian)' },
        ],
      },
      { name: 'name', label: 'Keterangan', type: 'text' },
      { name: 'source', label: 'Sumber', type: 'text' },
      { name: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
    ],
  },
  {
    key: 'leave-categories',
    label: 'Kategori Izin',
    hasDelete: true,
    path: '/admin/leave-categories',
    hasStatusToggle: true,
    columns: [
      { header: 'Nama', field: 'name' },
      { header: 'Kode', field: 'code' },
      { header: 'Status', render: statusText },
    ],
    fields: [
      { name: 'name', label: 'Nama kategori', type: 'text', required: true },
      { name: 'code', label: 'Kode', type: 'text', required: true },
      { name: 'sortOrder', label: 'Urutan tampil', type: 'number' },
      { name: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
    ],
  },
  {
    key: 'business-parameters',
    label: 'Parameter',
    path: '/admin/business-parameters',
    columns: [],
    fields: [],
  },
];