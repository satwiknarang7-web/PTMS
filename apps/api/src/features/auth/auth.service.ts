import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { permissionsForRole } from '../../common/constants/permissions.constants';
import { normalizeRole } from '../../common/constants/roles.constants';
import { PASSWORD_POLICY } from '../../common/validation/password.policy';
import { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { PasswordService } from '../users/password.service';
import { USER_PUBLIC_SELECT } from '../users/users.select';
import { LoginDto, TwoFactorCodeDto } from './dto/auth.dto';
import { LoginAttemptsService } from './login-attempts.service';
import { ClientMeta, TokenPair, TokenService } from './token.service';
import { TwoFactorService } from './two-factor.service';

const DAY_MS = 86_400_000;
/** How long the step between password and authenticator code may take. */
const CHALLENGE_TTL_SECONDS = 600;

interface ChallengePayload {
  sub: string;
  typ: 'two-factor';
  /** "Keep me signed in" chosen on the password step. */
  rem: boolean;
}

/** Password accepted: either a session, or the authenticator step that must come first. */
export type LoginResult =
  | { status: 'ok'; tokens: TokenPair }
  | { status: 'two_factor_required' | 'two_factor_setup_required'; challenge: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly passwords: PasswordService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly attempts: LoginAttemptsService,
    private readonly jwt: JwtService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  /** Public, non-sensitive settings the sign-in screens need. */
  publicConfig() {
    const app = this.config.get('app', { infer: true });
    return {
      appName: app.name,
      rememberMeDays: Math.round(this.config.get('auth', { infer: true }).rememberTtlMs / DAY_MS),
      passwordPolicy: PASSWORD_POLICY,
    };
  }

  async login(dto: LoginDto, meta: ClientMeta): Promise<LoginResult> {
    const email = dto.email.toLowerCase();
    // Unknown emails count too, so the response never tells which accounts exist.
    this.attempts.recordAttempt(email);
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { organization: { select: { isActive: true } } },
    });
    const valid = user ? await this.passwords.verify(dto.password, user.passwordHash) : false;
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    this.attempts.reset(email);
    this.assertCanSignIn(user);

    if (user.twoFactorEnabledAt || this.twoFactor.required) {
      const payload: ChallengePayload = { sub: user.id, typ: 'two-factor', rem: dto.remember ?? false };
      const challenge = await this.jwt.signAsync(payload, { secret: this.challengeSecret, expiresIn: CHALLENGE_TTL_SECONDS });
      return { status: user.twoFactorEnabledAt ? 'two_factor_required' : 'two_factor_setup_required', challenge };
    }
    return { status: 'ok', tokens: await this.startSession(user, meta, dto.remember ?? false) };
  }

  /** Second step of sign-in: an authenticator code or a one-time recovery code. */
  async verifyTwoFactor(dto: TwoFactorCodeDto, meta: ClientMeta): Promise<TokenPair> {
    const { user, remember } = await this.fromChallenge(dto.challenge);
    if (!user.twoFactorEnabledAt) throw new BadRequestException('Set up your authenticator app first');
    this.attempts.recordAttempt(user.email);
    if (!(await this.twoFactor.verify(user, { code: dto.code, recoveryCode: dto.recoveryCode }))) {
      throw new UnauthorizedException(dto.recoveryCode ? 'That recovery code is not valid or was already used' : 'That code is not right. Try the newest code from your app.');
    }
    this.attempts.reset(user.email);
    return this.startSession(user, meta, remember);
  }

  /** First sign-in with two-step required: the QR code to scan. */
  async beginTwoFactorSetup(challenge: string) {
    const { user } = await this.fromChallenge(challenge);
    if (user.twoFactorEnabledAt) throw new BadRequestException('Two-step sign-in is already set up');
    return this.twoFactor.beginSetup(user);
  }

  /** Confirms the setup with a first code, signs the person in and hands out their recovery codes. */
  async activateTwoFactor(dto: TwoFactorCodeDto, meta: ClientMeta): Promise<{ tokens: TokenPair; recoveryCodes: string[] }> {
    const { user, remember } = await this.fromChallenge(dto.challenge);
    if (user.twoFactorEnabledAt) throw new BadRequestException('Two-step sign-in is already set up');
    this.attempts.recordAttempt(user.email);
    const recoveryCodes = await this.twoFactor.activate(user, dto.code ?? '');
    this.attempts.reset(user.email);
    return { tokens: await this.startSession(user, meta, remember), recoveryCodes };
  }

  /** Two-step status for the profile page. */
  async twoFactorStatus(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return {
      enabled: !!user.twoFactorEnabledAt,
      enabledAt: user.twoFactorEnabledAt,
      required: this.twoFactor.required,
      recoveryCodesLeft: this.twoFactor.remainingRecoveryCodes(user),
    };
  }

  async regenerateRecoveryCodes(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return { recoveryCodes: await this.twoFactor.regenerateRecoveryCodes(user, code) };
  }

  private get challengeSecret(): string {
    // Distinct from the access-token key use, so a challenge can never pass as an access token.
    return `${this.config.get('auth', { infer: true }).accessSecret}:two-factor`;
  }

  private async fromChallenge(challenge: string) {
    let payload: ChallengePayload;
    try {
      payload = await this.jwt.verifyAsync<ChallengePayload>(challenge, { secret: this.challengeSecret });
    } catch {
      throw new UnauthorizedException('Sign-in took too long. Enter your email and password again.');
    }
    if (payload.typ !== 'two-factor') throw new UnauthorizedException('Sign-in took too long. Enter your email and password again.');
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, include: { organization: { select: { isActive: true } } } });
    if (!user) throw new UnauthorizedException('Sign-in took too long. Enter your email and password again.');
    this.assertCanSignIn(user);
    return { user, remember: payload.rem };
  }

  private assertCanSignIn(user: { isActive: boolean; organization: { isActive: boolean } | null }) {
    if (!user.isActive) {
      throw new ForbiddenException('Your account has been deactivated');
    }
    if (user.organization && !user.organization.isActive) {
      throw new ForbiddenException('Your organization has been suspended. Contact the platform administrator.');
    }
  }

  private async startSession(user: { id: string; organizationId: string | null; role: string }, meta: ClientMeta, remember: boolean): Promise<TokenPair> {
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.tokens.issue(user, meta, remember);
  }

  async refresh(refreshToken: string | undefined, meta: ClientMeta): Promise<TokenPair> {
    if (!refreshToken) throw new UnauthorizedException('No active session');
    const { userId, persistent } = await this.tokens.consume(refreshToken);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: { select: { isActive: true } } },
    });
    if (!user || !user.isActive || (user.organization && !user.organization.isActive)) {
      throw new UnauthorizedException('No active session');
    }
    return this.tokens.issue(user, meta, persistent);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) await this.tokens.revoke(refreshToken);
  }

  /** The signed-in account; for root, `organization` is the workspace it currently has open (or null). */
  async me(userId: string, organizationId: string | null) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: USER_PUBLIC_SELECT });
    const organization = organizationId ? await this.prisma.organization.findUnique({ where: { id: organizationId } }) : null;
    return { ...user, role: normalizeRole(user.role), organization, permissions: permissionsForRole(user.role) };
  }
}
