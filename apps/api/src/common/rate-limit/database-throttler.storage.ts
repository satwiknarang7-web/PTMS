import { Injectable, Logger } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { RateLimitStore } from './rate-limit.store';

/** Request throttling (per client, per route) on the shared database counters. */
@Injectable()
export class DatabaseThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(DatabaseThrottlerStorage.name);

  constructor(private readonly store: RateLimitStore) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
  ): ReturnType<ThrottlerStorage['increment']> {
    const now = new Date();
    // The request that uses up the limit still goes through; the ones after it are refused.
    let hit;
    try {
      hit = await this.store.hit(`throttle:${key}`, { windowMs: ttl, blockAt: limit, blockMs: blockDuration }, now);
    } catch (error) {
      // A hiccup in the counters must not take the whole API down; sign-in lockouts still apply.
      this.logger.warn(`Rate limiting skipped: ${(error as Error).message}`);
      return { totalHits: 0, timeToExpire: Math.ceil(ttl / 1000), isBlocked: false, timeToBlockExpire: 0 };
    }
    const seconds = (date: Date | null) => (date ? Math.max(0, Math.ceil((date.getTime() - now.getTime()) / 1000)) : 0);
    return {
      totalHits: hit.hits,
      timeToExpire: seconds(hit.expiresAt),
      isBlocked: hit.rejected,
      timeToBlockExpire: seconds(hit.blockedUntil),
    };
  }
}
