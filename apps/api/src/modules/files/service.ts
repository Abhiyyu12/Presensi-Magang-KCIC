import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { getDb } from '../../infrastructure/db.js';
import { putObject, removeObject, presignedGetUrl } from '../../infrastructure/minio.js';
import { loadEnv } from '../../config/env.js';
import { badRequest, unprocessable } from '../../common/errors.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_DIMENSION = 4096;
const MIN_DIMENSION = 60;

/** Magic-byte sniffing; MIME header alone is not trusted. */
export function sniffImageType(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

export interface ProcessedImage {
  buffer: Buffer;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
  sizeBytes: number;
  checksumSha256: string;
}

/**
 * Validate + normalize an uploaded selfie:
 * size limit, allowed MIME, magic bytes, successful decode, dimension bounds,
 * re-encode to JPEG (strips EXIF/metadata), sha256 of stored bytes.
 */
export async function validateAndProcessImage(buf: Buffer, declaredMime: string): Promise<ProcessedImage> {
  const env = loadEnv();
  if (buf.length === 0) throw badRequest('File bukti kosong.');
  if (buf.length > env.MAX_UPLOAD_BYTES) throw unprocessable(`Ukuran file melebihi batas ${Math.floor(env.MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`);
  if (!ALLOWED_MIME.has(declaredMime)) throw unprocessable('Format file tidak didukung. Gunakan JPEG/PNG/WebP dari kamera.');
  const sniffed = sniffImageType(buf);
  if (!sniffed || sniffed !== declaredMime) throw unprocessable('Isi file tidak cocok dengan tipe gambar yang valid.');

  let image: sharp.Sharp;
  let meta: { width?: number; height?: number };
  try {
    image = sharp(buf, { failOn: 'truncated' });
    meta = await image.metadata();
  } catch {
    throw unprocessable('File gambar rusak atau tidak dapat didecode.');
  }
  const { width, height } = meta;
  if (!width || !height) throw unprocessable('Dimensi gambar tidak valid.');
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) throw unprocessable('Resolusi gambar terlalu besar.');
  if (width < MIN_DIMENSION || height < MIN_DIMENSION) throw unprocessable('Resolusi gambar terlalu kecil.');

  // Re-encode: strips all EXIF/metadata, normalizes to JPEG.
  const reencoded = await image.rotate().jpeg({ quality: 85, mozjpeg: true }).toBuffer();
  const processed = await sharp(reencoded).metadata();
  return {
    buffer: reencoded,
    mimeType: 'image/jpeg',
    width: processed.width ?? width,
    height: processed.height ?? height,
    sizeBytes: reencoded.length,
    checksumSha256: createHash('sha256').update(reencoded).digest('hex'),
  };
}

/** Segment username yang aman dipakai sebagai folder objek MinIO. */
const USERNAME_KEY_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export type EvidenceCategory = 'datang' | 'pulang' | 'izin';

/** Key per-user: `{username}/{kategori}/{uuid}.jpg` — kategori datang/pulang/izin. */
export function generateObjectKey(username: string, category: EvidenceCategory): string {
  if (!USERNAME_KEY_SEGMENT.test(username)) {
    throw badRequest('Username tidak valid untuk menyimpan bukti.');
  }
  return `${username}/${category}/${randomUUID()}.jpg`;
}

export async function uploadEvidence(bucket: string, key: string, img: ProcessedImage): Promise<void> {
  await putObject(bucket, key, img.buffer, img.mimeType);
}

export async function compensateRemove(bucket: string, key: string): Promise<boolean> {
  try {
    await removeObject(bucket, key);
    return true;
  } catch {
    return false;
  }
}

export interface StoredFile {
  id: string;
  bucket: string;
  objectKey: string;
}

/** Create the FileObject row inside an caller-provided transaction. */
export async function createFileObjectTx(
  tx: Parameters<Parameters<ReturnType<typeof getDb>['$transaction']>[0]>[0],
  data: { bucket: string; objectKey: string; img: ProcessedImage; uploadedById: string | null },
) {
  return tx.fileObject.create({
    data: {
      bucket: data.bucket,
      objectKey: data.objectKey,
      mimeType: data.img.mimeType,
      sizeBytes: data.img.sizeBytes,
      checksumSha256: data.img.checksumSha256,
      width: data.img.width,
      height: data.img.height,
      uploadedById: data.uploadedById,
      status: 'ACTIVE',
    },
  });
}

export async function evidenceSignedUrl(fileObjectId: string): Promise<string> {
  const env = loadEnv();
  const db = getDb();
  const file = await db.fileObject.findUnique({ where: { id: fileObjectId } });
  if (!file || file.status !== 'ACTIVE') throw badRequest('Bukti tidak tersedia.');
  return presignedGetUrl(file.bucket, file.objectKey, env.SIGNED_URL_TTL_SECONDS);
}
