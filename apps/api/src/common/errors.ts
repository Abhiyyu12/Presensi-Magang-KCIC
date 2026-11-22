export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
    message: string,
    readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export const badRequest = (message = 'Permintaan tidak valid.', fieldErrors?: Record<string, string[]>) =>
  new AppError('VALIDATION_ERROR', 400, message, fieldErrors);
export const unauthorized = (message = 'Anda harus login untuk mengakses resource ini.') =>
  new AppError('UNAUTHORIZED', 401, message);
export const forbidden = (message = 'Anda tidak memiliki akses untuk melakukan operasi ini.') =>
  new AppError('FORBIDDEN', 403, message);
export const notFound = (message = 'Data tidak ditemukan.') => new AppError('NOT_FOUND', 404, message);
export const conflict = (message = 'Data konflik dengan state saat ini.') => new AppError('CONFLICT', 409, message);
export const unprocessable = (message = 'Permintaan tidak dapat diproses.', fieldErrors?: Record<string, string[]>) =>
  new AppError('UNPROCESSABLE', 422, message, fieldErrors);
export const tooManyRequests = (message = 'Terlalu banyak percobaan. Coba lagi nanti.') =>
  new AppError('RATE_LIMITED', 429, message);
export const internal = (message = 'Terjadi kesalahan pada server.') => new AppError('INTERNAL_ERROR', 500, message);

export function errorEnvelope(err: unknown, requestId: string) {
  if (err instanceof AppError) {
    return {
      status: err.statusCode,
      body: {
        error: {
          code: err.code,
          message: err.message,
          ...(err.fieldErrors ? { fieldErrors: err.fieldErrors } : {}),
          requestId,
        },
      },
    };
  }
  return {
    status: 500,
    body: { error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan pada server.', requestId } },
  };
}
