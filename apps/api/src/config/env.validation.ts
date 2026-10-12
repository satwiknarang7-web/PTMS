import { z } from 'zod';

const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((value) => (typeof value === 'boolean' ? value : ['true', '1', 'yes'].includes(value.toLowerCase())));

const durationPattern = /^\d+(ms|s|m|h|d)?$/;

/**
 * Single source of truth for every environment variable consumed by the API.
 * The process fails fast on boot when the environment is invalid.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_NAME: z.string().min(1).default('Project Tracker'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().min(1).default('api'),
  CORS_ORIGINS: z.string().default(''),
  SWAGGER_ENABLED: booleanish.default(false),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (PostgreSQL connection string)'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().regex(durationPattern).default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_REFRESH_EXPIRES_IN: z.string().regex(durationPattern).default('7d'),
  /** Session lifetime when the user ticks "Keep me signed in". */
  JWT_REFRESH_REMEMBER_EXPIRES_IN: z.string().regex(durationPattern).default('30d'),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(8).max(15).default(12),
  ACCESS_COOKIE_NAME: z.string().min(1).default('sptms_at'),
  REFRESH_COOKIE_NAME: z.string().min(1).default('sptms_rt'),
  /** Holds the organization the root account is currently working in. */
  ROOT_WORKSPACE_COOKIE_NAME: z.string().min(1).default('sptms_ws'),
  COOKIE_SECURE: booleanish.default(process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL)),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_DOMAIN: z.string().optional(),

  THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(300),
  AUTH_THROTTLE_LIMIT: z.coerce.number().int().positive().default(20),
  /** Failed sign-ins allowed per account before it is locked for LOGIN_LOCKOUT_MINUTES. */
  LOGIN_MAX_FAILURES: z.coerce.number().int().positive().default(10),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),

  /** Every account must sign in with an authenticator app code (TOTP). Turn off only for local development. */
  TWO_FACTOR_REQUIRED: booleanish.default(true),

  DEFAULT_PAGE_SIZE: z.coerce.number().int().positive().default(20),
  MAX_PAGE_SIZE: z.coerce.number().int().positive().default(200),

  /** Hour of the day (organization time zone) when everyone receives the list of that day's meetings. */
  MEETING_DIGEST_HOUR: z.coerce.number().int().min(0).max(23).default(8),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const details = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}
