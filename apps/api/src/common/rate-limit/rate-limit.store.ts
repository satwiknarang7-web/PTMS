import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface RateLimitHit {
  /** Hits counted in the current window, this one included (refused hits are not counted). */
  hits: number;
  /** This hit was refused because the key is blocked. */
  rejected: boolean;
  expiresAt: Date;
  blockedUntil: Date | null;
}

export interface RateLimitRule {
  /** Length of the counting window, from its first hit. */
  windowMs: number;
  /** The hit that reaches this count is allowed but blocks the key; later hits are refused. */
  blockAt: number;
  /** How long the key stays blocked, from the hit that reached `blockAt`. */
  blockMs: number;
}

/** Roughly one hit in this many also clears out old counters. */
const SWEEP_EVERY = 200;
/** Expired counters are kept this long before they are deleted. */
const SWEEP_GRACE_MS = 60 * 60 * 1000;

/**
 * Counters kept in Postgres so that every server instance shares them: on Vercel each request may
 * run in a fresh function instance, which makes in-memory limits easy to get around. Each hit is a
 * single atomic upsert, so parallel requests are all counted.
 */
@Injectable()
export class RateLimitStore {
  private readonly logger = new Logger(RateLimitStore.name);

  constructor(private readonly prisma: PrismaService) {}

  async hit(key: string, rule: RateLimitRule, now = new Date()): Promise<RateLimitHit> {
    const windowEnd = new Date(now.getTime() + rule.windowMs);
    const blockEnd = new Date(now.getTime() + rule.blockMs);
    const firstBlocks = rule.blockAt <= 1;
    const [row] = await this.prisma.$queryRaw<RateLimitHit[]>`
      INSERT INTO "RateLimit" ("key", "hits", "expiresAt", "blockedUntil", "rejected")
      VALUES (${key}, 1, ${windowEnd}, ${firstBlocks ? blockEnd : null}, false)
      ON CONFLICT ("key") DO UPDATE SET
        "hits" = CASE
          WHEN ${now} >= COALESCE("RateLimit"."blockedUntil", "RateLimit"."expiresAt") THEN 1
          WHEN "RateLimit"."blockedUntil" IS NOT NULL THEN "RateLimit"."hits"
          ELSE "RateLimit"."hits" + 1 END,
        "expiresAt" = CASE
          WHEN ${now} >= COALESCE("RateLimit"."blockedUntil", "RateLimit"."expiresAt") THEN ${windowEnd}
          ELSE "RateLimit"."expiresAt" END,
        "blockedUntil" = CASE
          WHEN ${now} >= COALESCE("RateLimit"."blockedUntil", "RateLimit"."expiresAt") THEN ${firstBlocks ? blockEnd : null}::timestamp(3)
          WHEN "RateLimit"."blockedUntil" IS NOT NULL THEN "RateLimit"."blockedUntil"
          WHEN "RateLimit"."hits" + 1 >= ${rule.blockAt} THEN ${blockEnd}
          ELSE NULL END,
        "rejected" = ${now} < COALESCE("RateLimit"."blockedUntil", "RateLimit"."expiresAt") AND "RateLimit"."blockedUntil" IS NOT NULL
      RETURNING "hits", "rejected", "expiresAt", "blockedUntil"`;
    if (Math.random() < 1 / SWEEP_EVERY) void this.sweep(now);
    return row;
  }

  /** Forgets a key, e.g. after a successful sign-in. */
  async reset(key: string): Promise<void> {
    await this.prisma.rateLimit.deleteMany({ where: { key } });
  }

  private async sweep(now: Date): Promise<void> {
    const cutoff = new Date(now.getTime() - SWEEP_GRACE_MS);
    try {
      await this.prisma.rateLimit.deleteMany({
        where: { expiresAt: { lt: cutoff }, OR: [{ blockedUntil: null }, { blockedUntil: { lt: cutoff } }] },
      });
    } catch (error) {
      this.logger.warn(`Could not clear old rate-limit counters: ${(error as Error).message}`);
    }
  }
}
