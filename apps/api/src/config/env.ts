import { z } from 'zod';

const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:5173'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 chars'),
  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
  COOKIE_SECURE: booleanish.default(false),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  MINIO_ENDPOINT: z.string().min(1),
  MINIO_PORT: z.coerce.number().int().positive().default(9000),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_BUCKET_ATTENDANCE: z.string().default('attendance-evidence'),
  MINIO_BUCKET_HELP: z.string().default('help-media'),
  MINIO_USE_SSL: booleanish.default(false),
  BOOTSTRAP_ADMIN_USERNAME: z.string().default('dev-admin'),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(8 * 1024 * 1024),
  SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(120),
  BUSINESS_TIMEZONE: z.string().default('Asia/Jakarta'),
  GEOCODE_ENABLED: booleanish.default(true),
  GEOCODE_BASE_URL: z.string().url().default('https://nominatim.openstreetmap.org'),
});

export type Env = z.infer<typeof envSchema>;

/** CORS_ORIGIN accepts one origin or a comma-separated list. */
export function parseOriginList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    // Fail fast with a safe message; do not print secret values.
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function isDev(env: Env = loadEnv()): boolean {
  return env.NODE_ENV === 'development' || env.NODE_ENV === 'test';
}
