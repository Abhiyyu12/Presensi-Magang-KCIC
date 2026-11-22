// Structural type so both PrismaClient and transaction clients are accepted.
type ParamReader = {
  businessParameter: {
    findUnique(args: { where: { key: string } }): Promise<{ valueJson: unknown } | null>;
  };
};

function paramValue(row: { valueJson: unknown } | null): unknown {
  const json = row?.valueJson;
  if (json && typeof json === 'object' && 'value' in json) return (json as { value: unknown }).value;
  return undefined;
}

export async function getNumberParam(db: ParamReader, key: string): Promise<number | null> {
  const row = await db.businessParameter.findUnique({ where: { key } });
  const value = paramValue(row);
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export async function getNumberArrayParam(db: ParamReader, key: string): Promise<number[] | null> {
  const row = await db.businessParameter.findUnique({ where: { key } });
  const value = paramValue(row);
  if (Array.isArray(value) && value.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    return value as number[];
  }
  return null;
}