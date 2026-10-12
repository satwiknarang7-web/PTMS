import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RateLimitStore } from '../../common/rate-limit/rate-limit.store';
import { AppConfig } from '../../config/configuration';

/**
 * Limits failed sign-ins per account. The per-IP throttler alone can be bypassed by rotating
 * client addresses, so password and code guessing is also capped for each email address. Counts
 * are kept in the database, so the cap holds across every server instance.
 */
@Injectable()
export class LoginAttemptsService {
  private readonly logger = new Logger(LoginAttemptsService.name);
  private readonly maxFailures: number;
  private readonly lockoutMs: number;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly store: RateLimitStore,
  ) {
    const throttle = config.get('throttle', { infer: true });
    this.maxFailures = throttle.loginMaxFailures;
    this.lockoutMs = throttle.loginLockoutMs;
  }

  /**
   * Counts a sign-in attempt, throwing 429 while the account is locked. Attempts are counted before the
   * password is checked, so parallel guesses cannot all slip past the limit; `reset` once it is right.
   * The lock runs for the whole lockout period from the attempt that reached the limit.
   */
  async recordAttempt(email: string, now = new Date()): Promise<void> {
    const hit = await this.store.hit(
      this.key(email),
      { windowMs: this.lockoutMs, blockAt: this.maxFailures, blockMs: this.lockoutMs },
      now,
    );
    if (hit.rejected && hit.blockedUntil) {
      const minutes = Math.max(1, Math.ceil((hit.blockedUntil.getTime() - now.getTime()) / 60_000));
      throw new HttpException(
        `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async reset(email: string): Promise<void> {
    try {
      await this.store.reset(this.key(email));
    } catch (error) {
      this.logger.error(`Sign-in attempts not cleared: ${(error as Error).message}`);
    }
  }

  private key(email: string): string {
    return `login:${email.toLowerCase()}`;
  }
}
