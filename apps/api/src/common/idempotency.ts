import type { PrismaClient } from '@prisma/client';
import { conflict } from './errors.js';
import { sha256 } from '../modules/auth/password.js';

export interface IdempotencyReplay {
  responseStatus: number;
  responseBodyJson: unknown;
}

/**
 * Check for a stored idempotent replay.
 * - Same key + same request hash -> replay stored response.
 * - Same key + different request hash -> conflict (never silently overwrite).
 */
export async function findReplay(
  db: PrismaClient,
  actorUserId: string,
  operation: string,
  idempotencyKey: string,
  requestHash: string,
): Promise<IdempotencyReplay | null> {
  const existing = await db.idempotencyRecord.findUnique({
    where: { actorUserId_operation_idempotencyKey: { actorUserId, operation, idempotencyKey } },
  });
  if (!existing) return null;
  if (existing.requestHash !== requestHash) {
    throw conflict('Idempotency-Key yang sama sudah digunakan untuk permintaan yang berbeda.');
  }
  return { responseStatus: existing.responseStatus, responseBodyJson: existing.responseBodyJson };
}

export function computeRequestHash(payload: Record<string, unknown>): string {
  return sha256(JSON.stringify(payload, Object.keys(payload).sort()));
}

/** Data for creating the idempotency record inside the business transaction. */
export function idempotencyRecordData(input: {
  actorUserId: string;
  operation: string;
  idempotencyKey: string;
  requestHash: string;
  responseStatus: number;
  responseBody: unknown;
}) {
  return {
    actorUserId: input.actorUserId,
    operation: input.operation,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    responseStatus: input.responseStatus,
    responseBodyJson: JSON.parse(JSON.stringify(input.responseBody)) as object,
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
  };
}
