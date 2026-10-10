import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { PasswordService } from './password.service';

export const AuthTokenPurpose = {
  INVITE: 'INVITE',
  PASSWORD_RESET: 'PASSWORD_RESET',
} as const;
export type AuthTokenPurpose = (typeof AuthTokenPurpose)[keyof typeof AuthTokenPurpose];

/** Web route that both invitation and reset links open. */
const SET_PASSWORD_PATH = '/reset-password';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

interface LinkRecipient {
  id: string;
  email: string;
  firstName: string;
}

/**
 * Single-use emailed links: invitations (new accounts choose their own password) and
 * password resets. Tokens are random, stored only as a hash and expire quickly.
 */
@Injectable()
export class AccountLinksService {
  private readonly logger = new Logger(AccountLinksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly passwords: PasswordService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /** A password nobody knows, for accounts that will set theirs through an invitation link. */
  async unusablePasswordHash(): Promise<string> {
    return this.passwords.hash(randomBytes(32).toString('hex'));
  }

  async sendInvite(user: LinkRecipient, origin: string, invitedBy?: string, workspace?: string): Promise<void> {
    const ttlMs = this.config.get('mail', { infer: true }).inviteTtlMs;
    const url = await this.createLink(user.id, AuthTokenPurpose.INVITE, ttlMs, origin);
    const appName = this.config.get('app', { infer: true }).name;
    const hours = Math.round(ttlMs / 3_600_000);
    await this.mail.send({
      to: user.email,
      subject: `You're invited to ${appName}`,
      paragraphs: [
        `Hi ${user.firstName},`,
        `${invitedBy ?? 'An administrator'} has created an account for you on ${appName}${workspace ? ` (${workspace})` : ''}.`,
        `Choose a password to activate it. Your sign-in email is ${user.email}. The link expires in ${hours} hours.`,
      ],
      action: { label: 'Set your password', url },
    });
  }

  /** Always resolves, whether or not the email belongs to an account, so accounts cannot be discovered. */
  async requestPasswordReset(email: string, origin: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { organization: { select: { isActive: true } } },
    });
    if (!user || !user.isActive || (user.organization && !user.organization.isActive)) {
      this.logger.log(`Password reset requested for unknown or inactive account ${email}`);
      return;
    }
    const ttlMs = this.config.get('mail', { infer: true }).resetTtlMs;
    const url = await this.createLink(user.id, AuthTokenPurpose.PASSWORD_RESET, ttlMs, origin);
    const appName = this.config.get('app', { infer: true }).name;
    await this.mail.send({
      to: user.email,
      subject: `Reset your ${appName} password`,
      paragraphs: [
        `Hi ${user.firstName},`,
        `We received a request to reset the password for ${user.email}. The link expires in ${Math.round(ttlMs / 60_000)} minutes.`,
        `If you didn't ask for this, you can ignore this email: your password stays the same.`,
      ],
      action: { label: 'Reset password', url },
    });
  }

  /** What the set-password screen shows before the user picks a password. */
  async inspect(token: string) {
    const record = await this.findValid(token);
    return { purpose: record.purpose, email: record.user.email, firstName: record.user.firstName };
  }

  /** Sets the new password, burns every open link of the account and signs it out everywhere. */
  async consume(token: string, password: string): Promise<{ email: string }> {
    const record = await this.findValid(token);
    const passwordHash = await this.passwords.hash(password);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
      this.prisma.authToken.updateMany({ where: { userId: record.userId, usedAt: null }, data: { usedAt: now } }),
      this.prisma.refreshToken.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: now } }),
    ]);
    return { email: record.user.email };
  }

  private async createLink(userId: string, purpose: AuthTokenPurpose, ttlMs: number, origin: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    await this.prisma.$transaction([
      // Only the newest link of each kind works.
      this.prisma.authToken.updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: now } }),
      this.prisma.authToken.create({
        data: { userId, purpose, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + ttlMs) },
      }),
    ]);
    return this.mail.link(`${SET_PASSWORD_PATH}?token=${token}`, origin);
  }

  private async findValid(token: string) {
    const record = await this.prisma.authToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { include: { organization: { select: { isActive: true } } } } },
    });
    const user = record?.user;
    if (!record || record.usedAt || record.expiresAt < new Date() || !user?.isActive || (user.organization && !user.organization.isActive)) {
      throw new BadRequestException('This link is invalid or has expired. Ask for a new one.');
    }
    return record;
  }
}
