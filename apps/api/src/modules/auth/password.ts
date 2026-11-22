import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';

export function hashPassword(plain: string): Promise<string> {
  return argonHash(plain, {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argonVerify(hash, plain).catch(() => false);
}

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export const passwordSchemaMin = 10;
