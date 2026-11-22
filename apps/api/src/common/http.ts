import { z } from 'zod';

export function ok<T>(data: T, requestId?: string) {
  return { data, meta: { requestId } };
}

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(15),
});

export type Pagination = z.infer<typeof paginationQuery>;

export function paginationMeta(p: Pagination, total: number) {
  return { page: p.page, pageSize: p.pageSize, total, totalPages: Math.max(1, Math.ceil(total / p.pageSize)) };
}

export function skipTake(p: Pagination) {
  return { skip: (p.page - 1) * p.pageSize, take: p.pageSize };
}

export const dateRangeQuery = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD').optional(),
  endDateExclusive: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD').optional(),
});

export function parseSort(sortBy: string | undefined, order: string | undefined, allowlist: string[], fallback: string) {
  const key = sortBy && allowlist.includes(sortBy) ? sortBy : fallback;
  const dir = order === 'asc' ? 'asc' : 'desc';
  return { key, dir } as const;
}
