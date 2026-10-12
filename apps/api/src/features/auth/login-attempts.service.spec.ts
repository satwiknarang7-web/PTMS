import { HttpException, HttpStatus } from '@nestjs/common';
import type { RateLimitHit, RateLimitRule } from '../../common/rate-limit/rate-limit.store';
import { LoginAttemptsService } from './login-attempts.service';

const EMAIL = 'qa@example.com';
const MINUTE = 60_000;
const start = Date.UTC(2026, 9, 9, 12);

/** In-memory stand-in with the same rules as the SQL upsert in RateLimitStore. */
class MemoryStore {
  private readonly rows = new Map<string, { hits: number; expiresAt: Date; blockedUntil: Date | null }>();

  async hit(key: string, rule: RateLimitRule, now: Date): Promise<RateLimitHit> {
    const row = this.rows.get(key);
    const expired = !row || now >= (row.blockedUntil ?? row.expiresAt);
    if (expired) {
      const fresh = {
        hits: 1,
        expiresAt: new Date(+now + rule.windowMs),
        blockedUntil: rule.blockAt <= 1 ? new Date(+now + rule.blockMs) : null,
      };
      this.rows.set(key, fresh);
      return { ...fresh, rejected: false };
    }
    if (row.blockedUntil) return { ...row, rejected: true };
    row.hits += 1;
    if (row.hits >= rule.blockAt) row.blockedUntil = new Date(+now + rule.blockMs);
    return { ...row, rejected: false };
  }

  async reset(key: string): Promise<void> {
    this.rows.delete(key);
  }
}

function setup(loginMaxFailures = 3, lockoutMinutes = 15) {
  const config = { get: () => ({ loginMaxFailures, loginLockoutMs: lockoutMinutes * MINUTE }) };
  return new LoginAttemptsService(config as never, new MemoryStore() as never);
}

/** The status and message thrown by an attempt, or null when it is allowed. */
async function attempt(service: LoginAttemptsService, now: number, email = EMAIL) {
  try {
    await service.recordAttempt(email, new Date(now));
    return null;
  } catch (error) {
    return { status: (error as HttpException).getStatus(), message: (error as HttpException).message };
  }
}

describe('LoginAttemptsService', () => {
  it('locks the account after the allowed number of failed attempts', async () => {
    const service = setup();
    expect([
      await attempt(service, start),
      await attempt(service, start + 1),
      await attempt(service, start + 2),
    ]).toEqual([null, null, null]);
    expect(await attempt(service, start + 3)).toEqual({
      status: HttpStatus.TOO_MANY_REQUESTS,
      message: 'Too many failed sign-in attempts. Try again in 15 minutes.',
    });
  });

  it('counts attempts before the password is checked, so parallel guesses cannot slip through', async () => {
    const service = setup();
    // Requests still waiting for their password check have each used up an attempt.
    const results = await Promise.all(Array.from({ length: 10 }, () => attempt(service, start)));
    expect(results.filter((result) => result === null)).toHaveLength(3);
  });

  it('keeps the account locked for the whole lockout period after the last failure', async () => {
    const service = setup();
    await attempt(service, start);
    await attempt(service, start + 10 * MINUTE);
    await attempt(service, start + 14 * MINUTE); // third failure: locked until start + 29 minutes
    expect(await attempt(service, start + 20 * MINUTE)).toEqual(
      expect.objectContaining({ message: 'Too many failed sign-in attempts. Try again in 9 minutes.' }),
    );
    expect(await attempt(service, start + 28.5 * MINUTE)).toEqual(
      expect.objectContaining({ message: 'Too many failed sign-in attempts. Try again in 1 minute.' }),
    );
    expect(await attempt(service, start + 29 * MINUTE)).toBeNull();
  });

  it('forgets failures older than the lockout window', async () => {
    const service = setup();
    await attempt(service, start);
    await attempt(service, start + MINUTE);
    // The window that started with the first failure has ended: counting starts again.
    expect([
      await attempt(service, start + 15 * MINUTE),
      await attempt(service, start + 16 * MINUTE),
      await attempt(service, start + 17 * MINUTE),
    ]).toEqual([null, null, null]);
    expect(await attempt(service, start + 18 * MINUTE)).not.toBeNull();
  });

  it('starts again after a successful sign-in', async () => {
    const service = setup();
    await attempt(service, start);
    await attempt(service, start);
    await service.reset(EMAIL);
    expect([await attempt(service, start), await attempt(service, start), await attempt(service, start)]).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('counts each account separately', async () => {
    const service = setup();
    for (let i = 0; i < 3; i++) await attempt(service, start);
    expect(await attempt(service, start)).not.toBeNull();
    expect(await attempt(service, start, 'other@example.com')).toBeNull();
  });
});
