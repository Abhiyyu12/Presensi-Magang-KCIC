import type { FastifyRequest } from 'fastify';
import { badRequest } from './errors.js';
import { loadEnv } from '../config/env.js';

export interface MultipartPayload {
  fields: Record<string, string>;
  file: { buffer: Buffer; mimetype: string } | null;
}

/**
 * Read a multipart request: exactly one image file field named "image",
 * plus string fields. Enforces upload size limit.
 */
export async function readMultipart(req: FastifyRequest): Promise<MultipartPayload> {
  const env = loadEnv();
  const fields: Record<string, string> = {};
  let file: MultipartPayload['file'] = null;
  for await (const part of req.parts()) {
    if (part.type === 'file') {
      if (part.fieldname !== 'image') throw badRequest('Field file harus bernama "image".');
      if (file) throw badRequest('Hanya satu file bukti yang diizinkan.');
      const buffer = await part.toBuffer();
      if (part.file.truncated) {
        throw badRequest(`Ukuran file melebihi batas ${Math.floor(env.MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`);
      }
      file = { buffer, mimetype: part.mimetype };
    } else if (part.type === 'field') {
      const value = part.value;
      fields[part.fieldname] = typeof value === 'string' ? value : String(value);
    }
  }
  if (!file) throw badRequest('File selfie wajib diunggah (field "image").');
  return { fields, file };
}

export function requireIdempotencyKey(req: FastifyRequest): string {
  const key = req.headers['idempotency-key'];
  if (typeof key !== 'string' || key.length < 8 || key.length > 128) {
    throw badRequest('Header Idempotency-Key wajib diisi (8-128 karakter).');
  }
  return key;
}

export function parseClientSubmittedAt(fields: Record<string, string>): string | null {
  const raw = fields.clientSubmittedAt;
  if (raw == null || raw === '') return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) {
    throw badRequest('clientSubmittedAt tidak valid (harus tanggal-waktu ISO-8601).', {
      clientSubmittedAt: ['Format tanggal-waktu tidak valid'],
    });
  }
  return new Date(ms).toISOString();
}

/**
 * Koordinat opsional: absen tetap sah tanpa GPS (izin ditolak / GPS tidak
 * tersedia), lokasi dicatat bila perangkat mengirimkannya. Nilai kosong → null;
 * nilai yang ada wajib numerik.
 */
export function parseCoords(fields: Record<string, string>): { latitude: number | null; longitude: number | null; accuracyMeters: number | null } {
  const lat = fields.latitude != null && fields.latitude !== '' ? Number(fields.latitude) : null;
  const lng = fields.longitude != null && fields.longitude !== '' ? Number(fields.longitude) : null;
  if ((lat != null && !Number.isFinite(lat)) || (lng != null && !Number.isFinite(lng))) {
    const fieldErrors: Record<string, string[]> = {};
    if (lat != null && !Number.isFinite(lat)) fieldErrors['latitude'] = ['nilainya harus numerik'];
    if (lng != null && !Number.isFinite(lng)) fieldErrors['longitude'] = ['nilainya harus numerik'];
    throw badRequest('Koordinat lokasi tidak valid.', fieldErrors);
  }
  const acc = fields.accuracyMeters != null && fields.accuracyMeters !== '' ? Number(fields.accuracyMeters) : null;
  return { latitude: lat, longitude: lng, accuracyMeters: acc != null && Number.isFinite(acc) ? acc : null };
}
