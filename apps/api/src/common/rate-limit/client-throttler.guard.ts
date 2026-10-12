import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { configuration } from '../../config/configuration';

/**
 * Throttles each signed-in person on their own budget, and anyone else per IP address. Per-person
 * limits keep a whole office behind one shared internet connection from running into a single
 * limit together; the session cookie is verified, so a forged one only counts against the IP.
 */
@Injectable()
export class ClientThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as unknown as Request;
    const userId = signedInUserId(request);
    return userId ? `user:${userId}` : `ip:${clientIp(request)}`;
  }

  protected override async throwThrottlingException(): Promise<void> {
    throw new ThrottlerException('Too many requests. Please wait a minute and try again.');
  }
}

const jwt = new JwtService();
let authConfig: ReturnType<typeof configuration>['auth'] | undefined;

function signedInUserId(req: Request): string | null {
  // Read once: the environment does not change while the server runs.
  const auth = (authConfig ??= configuration().auth);
  const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : undefined;
  const token: string | undefined = req.cookies?.[auth.cookies.accessName] ?? bearer;
  if (!token) return null;
  try {
    const payload = jwt.verify<{ sub?: unknown }>(token, { secret: auth.accessSecret });
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

/**
 * The address the request came from. On Vercel the platform sets `x-vercel-forwarded-for` /
 * `x-real-ip` itself (clients cannot override them); elsewhere Express's `req.ip` honours `trust proxy`.
 */
export function clientIp(req: Request): string {
  if (process.env.VERCEL) {
    const header = req.headers['x-vercel-forwarded-for'] ?? req.headers['x-real-ip'];
    const value = Array.isArray(header) ? header[0] : header;
    const ip = value?.split(',')[0]?.trim();
    if (ip) return ip;
  }
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}
