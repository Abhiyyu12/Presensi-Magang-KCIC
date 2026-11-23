import type { FastifyInstance, FastifyRequest } from 'fastify';
import ExcelJS from 'exceljs';
import type { CellValue, DataValidation } from 'exceljs';
import { getDb } from '../../infrastructure/db.js';
import { ok } from '../../common/http.js';
import { badRequest, forbidden, unprocessable } from '../../common/errors.js';
import { writeAudit } from '../../common/audit.js';
import { parseDateOnly } from '../../common/time.js';
import { authorize, requireCtx } from '../../app/auth.js';
import { hashPassword } from '../auth/password.js';
import { PHONE_PATTERN } from '../users/profileRoutes.js';
import type { AccessContext } from '../access/context.js';

// Fase 1.5f: import pengguna massal via Excel (.xlsx).
// Template dibangun dinamis dari data master terkini (dropdown pada sheet
// tersembunyi), validasi per baris di backend, password awal = username
// (permintaan UAT) dan pengguna tidak dipaksa ganti sandi saat login pertama.

const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_ROWS = 200;
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const IMPORT_COLUMNS = [
  { key: 'username', header: 'Username', width: 22 },
  { key: 'displayName', header: 'Nama Lengkap', width: 30 },
  { key: 'email', header: 'Email', width: 32 },
  { key: 'phone', header: 'No. HP', width: 18 },
  { key: 'roleCode', header: 'Kode Role', width: 14 },
  { key: 'participantNumber', header: 'Nomor Peserta', width: 18 },
  { key: 'bureauName', header: 'Direktorat', width: 26 },
  { key: 'divisionName', header: 'Biro', width: 26 },
  { key: 'placementName', header: 'Penempatan', width: 26 },
  { key: 'startDate', header: 'Tanggal Mulai (YYYY-MM-DD)', width: 24 },
  { key: 'endDate', header: 'Tanggal Selesai (YYYY-MM-DD)', width: 26 },
  { key: 'internStatus', header: 'Status Peserta', width: 16 },
] as const;

const INTERN_STATUS_MAP: Record<string, 'ACTIVE' | 'COMPLETED'> = {
  AKTIF: 'ACTIVE',
  SELESAI: 'COMPLETED',
};

interface ImportRow {
  row: number;
  username: string;
  displayName: string;
  email: string;
  phone: string;
  roleCode: string;
  participantNumber: string;
  bureauName: string;
  divisionName: string;
  placementName: string;
  startDate: string;
  endDate: string;
  internStatus: string;
}

interface ValidImportRow {
  row: number;
  username: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  roleId: string;
  roleCode: string;
  profile: {
    participantNumber: string;
    bureauId: string;
    divisionId: string | null;
    placementId: string | null;
    startDate: string;
    endDate: string | null;
    status: 'ACTIVE' | 'COMPLETED';
  } | null;
}

export interface ImportPreviewRow {
  row: number;
  username: string;
  displayName: string;
  roleCode: string;
  status: 'valid' | 'error';
  errors: string[];
}

function requireGlobalScope(ctx: AccessContext): void {
  if (!ctx.hasGlobalAdminScope) throw forbidden('Operasi ini memerlukan scope admin GLOBAL.');
}

// Excel mengeksekusi teks sel yang diawali = + - @ sebagai formula. Data master
// berasal dari DB sehingga tetap dibersihkan saat ditulis ke template.
function safeCellText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function cellText(value: CellValue): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text.trim();
    if ('result' in value && value.result != null) return cellText(value.result as CellValue);
    return '';
  }
  return String(value).trim();
}

function isValidDateOnly(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const ms = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(ms);
}

export async function buildUserImportTemplate(): Promise<Buffer> {
  const db = getDb();
  const [roles, bureaus, divisions, placements] = await Promise.all([
    db.role.findMany({ where: { status: 'ACTIVE' }, select: { code: true, name: true }, orderBy: { code: 'asc' } }),
    db.bureau.findMany({ where: { status: 'ACTIVE' }, select: { name: true }, orderBy: { name: 'asc' } }),
    db.division.findMany({ where: { status: 'ACTIVE' }, select: { name: true, bureauId: true }, orderBy: { name: 'asc' } }),
    db.placement.findMany({ where: { status: 'ACTIVE' }, select: { name: true }, orderBy: { name: 'asc' } }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Presensi Magang KCIC';

  const guide = wb.addWorksheet('Petunjuk');
  guide.columns = [{ width: 110 }];
  const instructions = [
    'PETUNJUK IMPORT PENGGUNA',
    '1. Isi data di sheet "Pengguna" mulai baris 2. Jangan mengubah atau menghapus baris header.',
    '2. Kolom wajib: Username, Nama Lengkap, Kode Role.',
    '3. Kode Role, Direktorat, Biro, Penempatan, dan Status Peserta memiliki dropdown dari data master terkini.',
    '4. Peserta magang (role INTERN) wajib mengisi Nomor Peserta, Direktorat, dan Tanggal Mulai.',
    '5. Jika Biro diisi, kolom Direktorat juga wajib diisi dan biro harus milik direktorat tersebut.',
    '6. Kolom tanggal bertipe tanggal (tampil YYYY-MM-DD) dengan validasi rentang 2020-2035 — Excel menolak nilai salah. Kolom No. HP bertipe teks (Excel tidak menghapus 0 di depan): isi 08xxxxxxxxxx atau kode negara apa pun, mis. +6281234567890.',
    '7. Password awal setiap pengguna sama dengan username-nya — pengguna bisa langsung login dengan itu.',
    `8. Maksimal ${MAX_IMPORT_ROWS} baris per file, ukuran file maksimal 2 MB.`,
    '9. Contoh baris berikut hanya ilustrasi — jangan ikut mengimpornya.',
  ];
  for (const text of instructions) {
    const r = guide.addRow([text]);
    r.getCell(1).alignment = { wrapText: false };
  }
  guide.getRow(1).font = { bold: true, size: 12 };
  guide.addRow([]);
  const exampleHeader = ['Username', 'Nama Lengkap', 'Email', 'No. HP', 'Kode Role', 'Nomor Peserta', 'Direktorat', 'Biro', 'Penempatan', 'Tanggal Mulai', 'Tanggal Selesai', 'Status Peserta'];
  const exampleRow = guide.addRow(exampleHeader);
  exampleRow.font = { bold: true };
  guide.addRow([
    'rina.wijaya', 'Rina Wijaya', 'rina.wijaya@kcic.co.id', '081234567890', 'INTERN',
    'MG-2026-001', 'Direktorat Operasi', '', '', '2026-01-15', '', 'AKTIF',
  ]);
  guide.addRow([
    'bagus.pratama', 'Bagus Pratama', '', '', 'SUPERVISOR', '', '', '', '', '', '', '',
  ]);

  // Nama tanpa spasi supaya formula dropdown `DataMaster!$A$2…` resolve ke sheet
  // internal — bila tidak cocok, Excel menganggapnya workbook eksternal (link rusak).
  const master = wb.addWorksheet('DataMaster');
  master.state = 'hidden';
  master.columns = [
    { header: 'Kode Role', width: 16 },
    { header: 'Nama Role', width: 26 },
    { header: 'Direktorat', width: 28 },
    { header: 'Biro', width: 28 },
    { header: 'Penempatan', width: 28 },
  ];
  const masterRowCount = Math.max(roles.length, bureaus.length, divisions.length, placements.length);
  for (let i = 0; i < masterRowCount; i += 1) {
    const role = roles[i];
    const bureau = bureaus[i];
    const division = divisions[i];
    const placement = placements[i];
    master.addRow([
      role ? safeCellText(role.code) : '',
      role ? safeCellText(role.name) : '',
      bureau ? safeCellText(bureau.name) : '',
      division ? safeCellText(division.name) : '',
      placement ? safeCellText(placement.name) : '',
    ]);
  }

  const sheet = wb.addWorksheet('Pengguna');
  sheet.columns = IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B1A1A' } };
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  const dvLastRow = MAX_IMPORT_ROWS + 1;
  if (roles.length > 0) {
    for (let r = 2; r <= dvLastRow; r += 1) {
      sheet.getCell(`E${r}`).dataValidation = {
        type: 'list', allowBlank: true, formulae: [`=DataMaster!$A$2:$A$${roles.length + 1}`],
      };
    }
  }
  if (bureaus.length > 0) {
    for (let r = 2; r <= dvLastRow; r += 1) {
      sheet.getCell(`G${r}`).dataValidation = {
        type: 'list', allowBlank: true, formulae: [`=DataMaster!$C$2:$C$${bureaus.length + 1}`],
      };
    }
  }
  if (divisions.length > 0) {
    for (let r = 2; r <= dvLastRow; r += 1) {
      sheet.getCell(`H${r}`).dataValidation = {
        type: 'list', allowBlank: true, formulae: [`=DataMaster!$D$2:$D$${divisions.length + 1}`],
      };
    }
  }
  if (placements.length > 0) {
    for (let r = 2; r <= dvLastRow; r += 1) {
      sheet.getCell(`I${r}`).dataValidation = {
        type: 'list', allowBlank: true, formulae: [`=DataMaster!$E$2:$E$${placements.length + 1}`],
      };
    }
  }
  // Kolom No. HP bertipe teks: bila format sel dibiarkan umum, Excel
  // memperlakukan 08… sebagai angka (0 di depan hilang) dan mengeksekusi
  // +62… sebagai formula. textLength 8-16 menutup 08xxxxxxxxxx maupun
  // kode negara + 7-15 digit (E.164).
  const PHONE_VALIDATION: DataValidation = {
    type: 'textLength',
    operator: 'between',
    allowBlank: true,
    formulae: ['8', '16'],
    showErrorMessage: true,
    errorTitle: 'No. HP tidak valid',
    error: 'Isi 08xxxxxxxxxx atau awali kode negara, mis. +6281234567890.',
    showInputMessage: true,
    promptTitle: 'No. HP',
    prompt: 'Isi 08xxxxxxxxxx atau +6281234567890.',
  };
  for (let r = 2; r <= dvLastRow; r += 1) {
    const cell = sheet.getCell(`D${r}`);
    cell.numFmt = '@';
    cell.dataValidation = { ...PHONE_VALIDATION };
  }
  // Kolom tanggal bertipe tanggal: format tampilan yyyy-mm-dd + validasi rentang.
  // Excel/xlsx tidak punya kalender popup bawaan (hanya bisa via macro/VBA yang
  // diblokir kebanyakan environment) — validasi + prompt adalah yang terdekat.
  // CATATAN ExcelJS: untuk type 'date' formulae WAJIB Date object — string
  // '=DATE(...)' dikonversi dateToExcel(new Date(string)) → NaN di XML.
  const DATE_VALIDATION: DataValidation = {
    type: 'date',
    operator: 'between',
    allowBlank: true,
    formulae: [new Date(Date.UTC(2020, 0, 1)), new Date(Date.UTC(2035, 11, 31))],
    showErrorMessage: true,
    errorTitle: 'Tanggal tidak valid',
    error: 'Isi tanggal format YYYY-MM-DD (mis. 2026-01-15) antara tahun 2020-2035.',
    showInputMessage: true,
    promptTitle: 'Tanggal (YYYY-MM-DD)',
    prompt: 'Isi tanggal, mis. 2026-01-15.',
  };
  for (const colLetter of ['J', 'K'] as const) {
    for (let r = 2; r <= dvLastRow; r += 1) {
      const cell = sheet.getCell(`${colLetter}${r}`);
      cell.numFmt = 'yyyy-mm-dd';
      cell.dataValidation = { ...DATE_VALIDATION };
    }
  }
  for (let r = 2; r <= dvLastRow; r += 1) {
    sheet.getCell(`L${r}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['"AKTIF,SELESAI"'],
    };
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function readImportFile(req: FastifyRequest): Promise<Buffer> {
  let buffer: Buffer | null = null;
  for await (const part of req.parts()) {
    if (part.type !== 'file') {
      throw badRequest('Kirim hanya file .xlsx pada field "file".');
    }
    if (part.fieldname !== 'file') throw badRequest('Field file harus bernama "file".');
    if (buffer) throw badRequest('Hanya satu file yang diizinkan.');
    if (!part.filename || !part.filename.toLowerCase().endsWith('.xlsx')) {
      throw badRequest('Format file harus .xlsx. Gunakan template yang disediakan.');
    }
    buffer = await part.toBuffer();
    if (part.file.truncated) throw badRequest('Ukuran file melebihi batas 2 MB.');
  }
  if (!buffer) throw badRequest('File .xlsx wajib diunggah (field "file").');
  if (buffer.byteLength > MAX_IMPORT_BYTES) throw badRequest('Ukuran file maksimal 2 MB.');
  return buffer;
}

async function parseUserImportWorkbook(buffer: Buffer): Promise<ImportRow[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw badRequest('File tidak dapat dibaca. Pastikan format .xlsx dan gunakan template yang disediakan.');
  }
  const sheet = wb.getWorksheet('Pengguna');
  if (!sheet) throw badRequest('Sheet "Pengguna" tidak ditemukan. Gunakan template yang disediakan.');

  const headerRow = sheet.getRow(1);
  const headerIndex = new Map<string, number>();
  IMPORT_COLUMNS.forEach((col) => {
    for (let c = 1; c <= sheet.columnCount; c += 1) {
      const text = cellText(headerRow.getCell(c).value).toLowerCase();
      if (text === col.header.toLowerCase()) {
        headerIndex.set(col.key, c);
        break;
      }
    }
    if (!headerIndex.has(col.key)) {
      throw badRequest(`Kolom "${col.header}" tidak ditemukan di sheet "Pengguna". Gunakan template yang disediakan.`);
    }
  });

  const readRow = (row: ExcelJS.Row): ImportRow | null => {
    const values: Record<string, string> = {};
    let hasAny = false;
    for (const col of IMPORT_COLUMNS) {
      const raw = row.getCell(headerIndex.get(col.key)!).value;
      const text = col.key === 'internStatus' ? cellText(raw).toUpperCase() : cellText(raw);
      if (text !== '') hasAny = true;
      values[col.key] = text;
    }
    if (!hasAny) return null;
    return {
      row: row.number,
      username: values.username ?? '',
      displayName: values.displayName ?? '',
      email: values.email ?? '',
      phone: values.phone ?? '',
      roleCode: values.roleCode ?? '',
      participantNumber: values.participantNumber ?? '',
      bureauName: values.bureauName ?? '',
      divisionName: values.divisionName ?? '',
      placementName: values.placementName ?? '',
      startDate: values.startDate ?? '',
      endDate: values.endDate ?? '',
      internStatus: values.internStatus ?? '',
    };
  };

  const rows: ImportRow[] = [];
  const lastRow = Math.min(sheet.rowCount, MAX_IMPORT_ROWS + 1);
  for (let r = 2; r <= sheet.rowCount; r += 1) {
    const parsed = readRow(sheet.getRow(r));
    if (!parsed) continue;
    rows.push(parsed);
    if (r > lastRow) {
      throw badRequest(`Maksimal ${MAX_IMPORT_ROWS} baris data per file.`);
    }
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    throw badRequest(`Maksimal ${MAX_IMPORT_ROWS} baris data per file.`);
  }
  return rows;
}

async function validateImportRows(
  rows: ImportRow[],
): Promise<{ preview: ImportPreviewRow[]; valid: ValidImportRow[] }> {
  const db = getDb();
  const [roles, bureaus, divisions, placements] = await Promise.all([
    db.role.findMany({ where: { status: 'ACTIVE' }, select: { id: true, code: true, name: true } }),
    db.bureau.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true } }),
    db.division.findMany({ where: { status: 'ACTIVE' }, select: { id: true, bureauId: true, name: true } }),
    db.placement.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true } }),
  ]);
  const usernames = rows.map((r) => r.username).filter((v) => v !== '');
  const emails = rows.map((r) => r.email).filter((v) => v !== '');
  const participantNumbers = rows.map((r) => r.participantNumber).filter((v) => v !== '');
  const [existingUsers, existingProfiles] = await Promise.all([
    usernames.length || emails.length
      ? db.user.findMany({
          where: {
            OR: [
              ...(usernames.length ? [{ username: { in: usernames, mode: 'insensitive' as const } }] : []),
              ...(emails.length ? [{ email: { in: emails, mode: 'insensitive' as const } }] : []),
            ],
          },
          select: { username: true, email: true },
        })
      : Promise.resolve([]),
    participantNumbers.length
      ? db.internProfile.findMany({
          where: { participantNumber: { in: participantNumbers } },
          select: { participantNumber: true },
        })
      : Promise.resolve([]),
  ]);
  const takenUsernames = new Set(existingUsers.map((u) => u.username.toLowerCase()));
  const takenEmails = new Set(existingUsers.map((u) => (u.email ?? '').toLowerCase()));
  const takenParticipantNumbers = new Set(existingProfiles.map((p) => p.participantNumber.toLowerCase()));
  const seenUsernames = new Set<string>();

  const preview: ImportPreviewRow[] = [];
  const valid: ValidImportRow[] = [];

  for (const row of rows) {
    const errors: string[] = [];
    const username = row.username.toLowerCase();

    if (!row.username) errors.push('Username wajib diisi.');
    else if (!/^[A-Za-z0-9._-]{3,64}$/.test(row.username)) {
      errors.push('Username harus 3-64 karakter (huruf, angka, titik, garis bawah, strip).');
    } else if (seenUsernames.has(username)) {
      errors.push('Username duplikat di dalam file.');
    } else if (takenUsernames.has(username)) {
      errors.push('Username sudah dipakai pengguna lain.');
    }
    if (row.username && !seenUsernames.has(username)) seenUsernames.add(username);

    if (!row.displayName) errors.push('Nama Lengkap wajib diisi.');
    else if (row.displayName.length > 128) errors.push('Nama Lengkap maksimal 128 karakter.');

    if (row.email) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email) || row.email.length > 255) {
        errors.push('Email tidak valid.');
      } else if (takenEmails.has(row.email.toLowerCase())) {
        errors.push('Email sudah dipakai pengguna lain.');
      }
    }
    if (row.phone && !PHONE_PATTERN.test(row.phone)) {
      errors.push('No. HP tidak valid. Gunakan 08xxxxxxxxxx atau awali kode negara, mis. +6281234567890.');
    }

    const role = roles.find((r) => r.code.toLowerCase() === row.roleCode.toLowerCase());
    if (!row.roleCode) errors.push('Kode Role wajib diisi.');
    else if (!role) errors.push(`Kode Role "${row.roleCode}" tidak ada di daftar.`);

    const trioFilled = Boolean(row.participantNumber && row.bureauName && row.startDate);
    const anyProfileField = Boolean(
      row.participantNumber || row.bureauName || row.startDate || row.divisionName
        || row.placementName || row.endDate || row.internStatus,
    );
    if (row.roleCode && role && role.code === 'INTERN' && !trioFilled) {
      errors.push('Peserta magang wajib mengisi Nomor Peserta, Direktorat, dan Tanggal Mulai.');
    } else if (anyProfileField && !trioFilled) {
      errors.push('Profil peserta butuh Nomor Peserta, Direktorat, dan Tanggal Mulai diisi lengkap.');
    }

    let bureauId: string | null = null;
    if (row.bureauName && trioFilled) {
      const bureau = bureaus.find((b) => b.name.toLowerCase() === row.bureauName.toLowerCase());
      if (!bureau) errors.push(`Direktorat "${row.bureauName}" tidak ada di daftar.`);
      else bureauId = bureau.id;
    }

    let divisionId: string | null = null;
    if (row.divisionName && !row.bureauName) {
      errors.push('Biro diisi tanpa Direktorat — isi kolom Direktorat juga.');
    } else if (row.divisionName && bureauId) {
      const candidates = divisions.filter((d) => d.name.toLowerCase() === row.divisionName.toLowerCase());
      const inBureau = candidates.filter((d) => d.bureauId === bureauId);
      if (inBureau.length === 1 && inBureau[0]) divisionId = inBureau[0].id;
      else if (candidates.length === 0) errors.push(`Biro "${row.divisionName}" tidak ada di daftar.`);
      else errors.push(`Biro "${row.divisionName}" bukan milik direktorat tersebut.`);
    }

    let placementId: string | null = null;
    if (row.placementName && trioFilled) {
      const placement = placements.find((p) => p.name.toLowerCase() === row.placementName.toLowerCase());
      if (!placement) errors.push(`Penempatan "${row.placementName}" tidak ada di daftar.`);
      else placementId = placement.id;
    }

    let startDate: string | null = null;
    if (row.startDate) {
      if (!isValidDateOnly(row.startDate)) errors.push('Tanggal Mulai harus format YYYY-MM-DD.');
      else startDate = row.startDate;
    }

    let endDate: string | null = null;
    if (row.endDate) {
      if (!isValidDateOnly(row.endDate)) errors.push('Tanggal Selesai harus format YYYY-MM-DD.');
      else endDate = row.endDate;
    }
    if (startDate && endDate && parseDateOnly(endDate) < parseDateOnly(startDate)) {
      errors.push('Tanggal Selesai tidak boleh sebelum Tanggal Mulai.');
    }

    let internStatus: 'ACTIVE' | 'COMPLETED' = 'ACTIVE';
    if (row.internStatus && row.internStatus !== '') {
      const mapped = INTERN_STATUS_MAP[row.internStatus];
      if (!mapped) errors.push('Status Peserta harus AKTIF atau SELESAI.');
      else internStatus = mapped;
    }

    if (row.participantNumber && takenParticipantNumbers.has(row.participantNumber.toLowerCase())) {
      errors.push('Nomor Peserta sudah dipakai peserta lain.');
    }

    const item: ImportPreviewRow = {
      row: row.row,
      username: row.username,
      displayName: row.displayName,
      roleCode: row.roleCode,
      status: errors.length === 0 ? 'valid' : 'error',
      errors,
    };
    preview.push(item);
    if (errors.length === 0 && role) {
      valid.push({
        row: row.row,
        username: row.username,
        displayName: row.displayName,
        email: row.email || null,
        phone: row.phone || null,
        roleId: role.id,
        roleCode: role.code,
        profile:
          trioFilled && startDate && bureauId
            ? {
                participantNumber: row.participantNumber,
                bureauId,
                divisionId,
                placementId,
                startDate,
                endDate,
                status: internStatus,
              }
            : null,
      });
    }
  }

  return { preview, valid };
}

export function registerUserImportRoutes(app: FastifyInstance): void {
  app.get(
    '/admin/users/import/template',
    { preHandler: authorize('admin:users:manage') },
    async (req, reply) => {
      const ctx = requireCtx(req);
      requireGlobalScope(ctx);
      const buffer = await buildUserImportTemplate();
      reply
        .header('Content-Type', XLSX_MIME)
        .header('Content-Disposition', 'attachment; filename="template-import-pengguna.xlsx"')
        .header('Cache-Control', 'no-store');
      return reply.send(buffer);
    },
  );

  app.post('/admin/users/import/validate', { preHandler: authorize('admin:users:manage') }, async (req) => {
    const ctx = requireCtx(req);
    requireGlobalScope(ctx);
    const buffer = await readImportFile(req);
    const rows = await parseUserImportWorkbook(buffer);
    if (rows.length === 0) {
      throw badRequest('Tidak ada baris data di sheet "Pengguna".');
    }
    const { preview } = await validateImportRows(rows);
    const validCount = preview.filter((p) => p.status === 'valid').length;
    return ok(
      {
        totalRows: preview.length,
        validCount,
        errorCount: preview.length - validCount,
        rows: preview,
      },
      req.id,
    );
  });

  app.post('/admin/users/import/confirm', { preHandler: authorize('admin:users:manage') }, async (req) => {
    const ctx = requireCtx(req);
    requireGlobalScope(ctx);
    const buffer = await readImportFile(req);
    const rows = await parseUserImportWorkbook(buffer);
    if (rows.length === 0) {
      throw badRequest('Tidak ada baris data di sheet "Pengguna".');
    }
    const { preview, valid } = await validateImportRows(rows);
    const skippedRows = preview.filter((p) => p.status === 'error');
    if (valid.length === 0) {
      throw unprocessable('Tidak ada baris valid untuk diimpor. Perbaiki file lalu unggah ulang.');
    }

    const report = await getDb().$transaction(async (tx) => {
      const created: { row: number; username: string; displayName: string; initialPassword: string }[] = [];
      for (const v of valid) {
        const initialPassword = v.username;
        const passwordHash = await hashPassword(initialPassword);
        const user = await tx.user.create({
          data: {
            username: v.username,
            displayName: v.displayName,
            passwordHash,
            email: v.email,
            phone: v.phone,
            accountStatus: 'ACTIVE',
            roleAssignments: {
              create: { roleId: v.roleId, validFrom: new Date(), assignedBy: ctx.user.id },
            },
            ...(v.profile
              ? {
                  internProfile: {
                    create: {
                      participantNumber: v.profile.participantNumber,
                      bureauId: v.profile.bureauId,
                      divisionId: v.profile.divisionId,
                      placementId: v.profile.placementId,
                      startDate: parseDateOnly(v.profile.startDate),
                      endDate: v.profile.endDate ? parseDateOnly(v.profile.endDate) : null,
                      status: v.profile.status,
                    },
                  },
                }
              : {}),
          },
          select: { id: true, username: true, displayName: true },
        });
        await writeAudit(tx as never, {
          actorUserId: ctx.user.id,
          action: 'ADMIN_USER_CREATE',
          objectType: 'user',
          objectId: user.id,
          after: { username: user.username, displayName: user.displayName, importRow: v.row },
          requestId: req.id,
        });
        created.push({ row: v.row, username: user.username, displayName: user.displayName, initialPassword });
      }
      // Ringkasan audit sengaja tidak menyimpan nilai password (sama dengan username).
      await writeAudit(tx as never, {
        actorUserId: ctx.user.id,
        action: 'ADMIN_USER_IMPORT',
        objectType: 'user_import',
        after: {
          created: created.map((c) => c.username),
          skippedRows: skippedRows.map((s) => s.row),
        },
        requestId: req.id,
      });
      return created;
    });

    return ok(
      {
        created: report.length,
        skipped: skippedRows.length,
        users: report,
        skippedRows,
      },
      req.id,
    );
  });
}
