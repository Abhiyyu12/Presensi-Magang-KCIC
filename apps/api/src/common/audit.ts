import type { PrismaClient } from '@prisma/client';

export interface AuditInput {
  actorUserId?: string | null;
  action: string;
  objectType: string;
  objectId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  outcome?: 'SUCCESS' | 'FAILURE' | 'DENIED';
  requestId?: string | null;
}

export async function writeAudit(db: PrismaClient, input: AuditInput): Promise<void> {
  await db.auditEvent.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      objectType: input.objectType,
      objectId: input.objectId ?? null,
      beforeJson: input.before === undefined ? undefined : (JSON.parse(JSON.stringify(input.before)) as object),
      afterJson: input.after === undefined ? undefined : (JSON.parse(JSON.stringify(input.after)) as object),
      reason: input.reason ?? null,
      outcome: input.outcome ?? 'SUCCESS',
      requestId: input.requestId ?? null,
    },
  });
}

/** Fields that must never appear in audit before/after snapshots. */
const REDACT_KEYS = new Set(['passwordHash', 'password', 'tokenHash', 'token', 'secret', 'secretKey']);

export function redactForAudit<T>(value: T): T {
  const json = JSON.parse(JSON.stringify(value ?? null), (key, v) =>
    REDACT_KEYS.has(key) ? '[REDACTED]' : v,
  );
  return json as T;
}
