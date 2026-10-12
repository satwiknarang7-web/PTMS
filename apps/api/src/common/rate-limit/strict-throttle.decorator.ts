import { Throttle } from '@nestjs/throttler';
import { configuration } from '../../config/configuration';

/**
 * The stricter per-client limit for endpoints that check a secret (password, authenticator or
 * recovery code). Resolved lazily at request time, once the environment is loaded.
 */
export const StrictThrottle = () =>
  Throttle({
    default: {
      limit: () => configuration().throttle.authLimit,
      ttl: () => configuration().throttle.ttlMs,
    },
  });
