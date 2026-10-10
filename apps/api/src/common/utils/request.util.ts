import type { Request } from 'express';

/** Public origin of the web app as seen by the browser that sent the request (used for emailed links). */
export function requestOrigin(req: Request): string {
  const origin = req.get('origin');
  if (origin) return origin;
  const host = req.get('x-forwarded-host') ?? req.get('host');
  return host ? `${req.protocol}://${host}` : '';
}
