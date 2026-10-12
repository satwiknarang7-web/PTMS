import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';
import { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';

/** RFC 6238 settings every authenticator app understands. */
const STEP_SECONDS = 30;
const DIGITS = 6;
/** Codes from one step before or after are accepted, to absorb clock drift. */
const DRIFT_STEPS = 1;
const RECOVERY_CODE_COUNT = 8;
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of input.replace(/=+$/, '').toUpperCase()) {
    const index = BASE32.indexOf(char);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function hotp(secret: Buffer, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secret).update(message).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const normalizeRecovery = (code: string) => code.replace(/[\s-]/g, '').toUpperCase();

interface TwoFactorUser {
  id: string;
  email: string;
  twoFactorSecret: string | null;
  twoFactorRecoveryCodes: string | null;
  twoFactorLastStep: number | null;
}

/**
 * Authenticator-app sign-in (TOTP, RFC 6238). Secrets are stored encrypted (AES-256-GCM, key derived
 * from JWT_ACCESS_SECRET, so changing that secret means everyone sets up their app again); recovery
 * codes are stored only as hashes and each works once.
 */
@Injectable()
export class TwoFactorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  get required(): boolean {
    return this.config.get('twoFactor', { infer: true }).required;
  }

  /** Creates (or replaces) the not-yet-confirmed secret and returns what the authenticator app needs. */
  async beginSetup(user: { id: string; email: string }) {
    const secret = base32Encode(randomBytes(20));
    await this.prisma.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: this.encrypt(secret), twoFactorEnabledAt: null, twoFactorRecoveryCodes: null, twoFactorLastStep: null },
    });
    const issuer = this.config.get('app', { infer: true }).name;
    const label = encodeURIComponent(`${issuer}:${user.email}`);
    const otpauthUrl = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
    const qrCode = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 });
    // Grouped for people who type the key in by hand.
    return { secret: secret.match(/.{1,4}/g)!.join(' '), otpauthUrl, qrCode };
  }

  /** Confirms the setup with a first code; returns the recovery codes, shown once. */
  async activate(user: TwoFactorUser, code: string): Promise<string[]> {
    if (!user.twoFactorSecret) throw new BadRequestException('Start the setup again: scan the new QR code');
    const step = this.matchStep(this.decrypt(user.twoFactorSecret), code, null);
    if (step === null) throw new BadRequestException('That code is not right. Check the time on your phone and try the newest code.');
    const recoveryCodes = this.newRecoveryCodes();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabledAt: new Date(), twoFactorLastStep: step, twoFactorRecoveryCodes: JSON.stringify(recoveryCodes.map((c) => sha256(normalizeRecovery(c)))) },
    });
    return recoveryCodes;
  }

  /** Checks an authenticator code (or a one-time recovery code) at sign-in. */
  async verify(user: TwoFactorUser, input: { code?: string; recoveryCode?: string }): Promise<boolean> {
    if (!user.twoFactorSecret) return false;
    if (input.recoveryCode) {
      const hashes: string[] = JSON.parse(user.twoFactorRecoveryCodes ?? '[]');
      const hash = sha256(normalizeRecovery(input.recoveryCode));
      if (!hashes.includes(hash)) return false;
      await this.prisma.user.update({ where: { id: user.id }, data: { twoFactorRecoveryCodes: JSON.stringify(hashes.filter((h) => h !== hash)) } });
      return true;
    }
    if (!input.code) return false;
    const step = this.matchStep(this.decrypt(user.twoFactorSecret), input.code, user.twoFactorLastStep);
    if (step === null) return false;
    await this.prisma.user.update({ where: { id: user.id }, data: { twoFactorLastStep: step } });
    return true;
  }

  async regenerateRecoveryCodes(user: TwoFactorUser, code: string): Promise<string[]> {
    if (!(await this.verify(user, { code }))) throw new BadRequestException('That code is not right');
    const recoveryCodes = this.newRecoveryCodes();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { twoFactorRecoveryCodes: JSON.stringify(recoveryCodes.map((c) => sha256(normalizeRecovery(c)))) },
    });
    return recoveryCodes;
  }

  /** Clears the authenticator; the person sets it up again at their next sign-in. */
  async reset(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { twoFactorSecret: null, twoFactorEnabledAt: null, twoFactorRecoveryCodes: null, twoFactorLastStep: null },
      }),
      this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
  }

  remainingRecoveryCodes(user: { twoFactorRecoveryCodes: string | null }): number {
    return (JSON.parse(user.twoFactorRecoveryCodes ?? '[]') as string[]).length;
  }

  /** The time step the code belongs to, or null; steps at or before `lastStep` are rejected (no replay). */
  private matchStep(secret: string, code: string, lastStep: number | null): number | null {
    const clean = code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(clean)) return null;
    const key = base32Decode(secret);
    const current = Math.floor(Date.now() / 1000 / STEP_SECONDS);
    for (let drift = -DRIFT_STEPS; drift <= DRIFT_STEPS; drift++) {
      const step = current + drift;
      if (lastStep !== null && step <= lastStep) continue;
      const expected = Buffer.from(hotp(key, step));
      if (timingSafeEqual(expected, Buffer.from(clean))) return step;
    }
    return null;
  }

  private newRecoveryCodes(): string[] {
    return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
      const raw = base32Encode(randomBytes(5)).slice(0, 8);
      return `${raw.slice(0, 4)}-${raw.slice(4)}`;
    });
  }

  private key(): Buffer {
    return createHash('sha256').update(`two-factor:${this.config.get('auth', { infer: true }).accessSecret}`).digest();
  }

  private encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64')).join('.');
  }

  private decrypt(stored: string): string {
    const [iv, tag, data] = stored.split('.').map((part) => Buffer.from(part, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', this.key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }
}
