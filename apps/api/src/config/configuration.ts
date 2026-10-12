import { validateEnv } from './env.validation';
import { parseDurationMs } from '../common/utils/duration.util';

/**
 * Strongly typed, namespaced configuration built from validated env variables.
 * Inject with `ConfigService<AppConfig, true>` and read via `get('auth', { infer: true })`.
 */
export const configuration = () => {
  cached ??= buildConfiguration();
  return cached;
};

let cached: ReturnType<typeof buildConfiguration> | undefined;

const buildConfiguration = () => {
  const env = validateEnv(process.env);

  return {
    app: {
      name: env.APP_NAME,
      env: env.NODE_ENV,
      isProduction: env.NODE_ENV === 'production',
      port: env.PORT,
      apiPrefix: env.API_PREFIX,
      corsOrigins: env.CORS_ORIGINS.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
      swaggerEnabled: env.SWAGGER_ENABLED,
    },
    auth: {
      accessSecret: env.JWT_ACCESS_SECRET,
      accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
      accessTtlMs: parseDurationMs(env.JWT_ACCESS_EXPIRES_IN),
      refreshSecret: env.JWT_REFRESH_SECRET,
      refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
      refreshTtlMs: parseDurationMs(env.JWT_REFRESH_EXPIRES_IN),
      rememberTtlMs: parseDurationMs(env.JWT_REFRESH_REMEMBER_EXPIRES_IN),
      saltRounds: env.BCRYPT_SALT_ROUNDS,
      cookies: {
        accessName: env.ACCESS_COOKIE_NAME,
        refreshName: env.REFRESH_COOKIE_NAME,
        workspaceName: env.ROOT_WORKSPACE_COOKIE_NAME,
        secure: env.COOKIE_SECURE,
        sameSite: env.COOKIE_SAME_SITE,
        domain: env.COOKIE_DOMAIN || undefined,
      },
    },
    throttle: {
      ttlMs: env.THROTTLE_TTL_MS,
      limit: env.THROTTLE_LIMIT,
      authLimit: env.AUTH_THROTTLE_LIMIT,
      loginMaxFailures: env.LOGIN_MAX_FAILURES,
      loginLockoutMs: env.LOGIN_LOCKOUT_MINUTES * 60_000,
    },
    twoFactor: {
      required: env.TWO_FACTOR_REQUIRED,
    },
    pagination: {
      defaultPageSize: env.DEFAULT_PAGE_SIZE,
      maxPageSize: env.MAX_PAGE_SIZE,
    },
    meetings: {
      digestHour: env.MEETING_DIGEST_HOUR,
    },
  };
};

export type AppConfig = ReturnType<typeof buildConfiguration>;
