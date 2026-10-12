import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AccountScope, ForAccounts } from '../../common/decorators/account-scope.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Principal } from '../../common/interfaces/authenticated-user.interface';
import { configuration } from '../../config/configuration';
import { AuthCookieService } from './auth-cookie.service';
import { AuthService } from './auth.service';
import { AuthenticatorCodeDto, ChallengeDto, LoginDto, TwoFactorCodeDto } from './dto/auth.dto';
import { ClientMeta } from './token.service';
import { ViewerAllowed } from '../../common/decorators/viewer-allowed.decorator';

/** Stricter rate limit for credential endpoints; resolved lazily at request time once env is loaded. */
const authThrottle = () =>
  Throttle({
    default: {
      limit: () => configuration().throttle.authLimit,
      ttl: () => configuration().throttle.ttlMs,
    },
  });

@ApiTags('Auth')
@ViewerAllowed()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: AuthCookieService,
  ) {}

  @Public()
  @Get('config')
  config() {
    return this.auth.publicConfig();
  }

  /**
   * Password step. With two-step sign-in the response carries a short-lived `challenge` instead of a
   * session: `two_factor_required` (enter a code) or `two_factor_setup_required` (scan the QR code first).
   */
  @Public()
  @authThrottle()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(dto, this.meta(req));
    if (result.status !== 'ok') return { status: result.status, challenge: result.challenge };
    this.cookies.set(res, result.tokens);
    this.cookies.clearWorkspace(res);
    return { status: 'ok', success: true };
  }

  @Public()
  @authThrottle()
  @HttpCode(HttpStatus.OK)
  @Post('two-factor/verify')
  async verifyTwoFactor(@Body() dto: TwoFactorCodeDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.verifyTwoFactor(dto, this.meta(req));
    this.cookies.set(res, tokens);
    this.cookies.clearWorkspace(res);
    return { status: 'ok', success: true };
  }

  /** First sign-in: returns the QR code and key for the authenticator app. */
  @Public()
  @authThrottle()
  @HttpCode(HttpStatus.OK)
  @Post('two-factor/setup')
  setupTwoFactor(@Body() dto: ChallengeDto) {
    return this.auth.beginTwoFactorSetup(dto.challenge);
  }

  /** Confirms the authenticator with a first code; signs in and returns the one-time recovery codes. */
  @Public()
  @authThrottle()
  @HttpCode(HttpStatus.OK)
  @Post('two-factor/activate')
  async activateTwoFactor(@Body() dto: TwoFactorCodeDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { tokens, recoveryCodes } = await this.auth.activateTwoFactor(dto, this.meta(req));
    this.cookies.set(res, tokens);
    this.cookies.clearWorkspace(res);
    return { status: 'ok', recoveryCodes };
  }

  @Get('two-factor')
  @ForAccounts(AccountScope.ANY)
  twoFactorStatus(@CurrentUser('id') userId: string) {
    return this.auth.twoFactorStatus(userId);
  }

  /** Profile: QR code to turn two-step sign-in on while signed in. */
  @Post('two-factor/enable')
  @HttpCode(HttpStatus.OK)
  @ForAccounts(AccountScope.ANY)
  beginOwnTwoFactorSetup(@CurrentUser('id') userId: string) {
    return this.auth.beginOwnTwoFactorSetup(userId);
  }

  @Post('two-factor/enable/confirm')
  @HttpCode(HttpStatus.OK)
  @ForAccounts(AccountScope.ANY)
  activateOwnTwoFactor(@CurrentUser('id') userId: string, @Body() dto: AuthenticatorCodeDto) {
    return this.auth.activateOwnTwoFactor(userId, dto.code);
  }

  @Post('two-factor/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ForAccounts(AccountScope.ANY)
  disableOwnTwoFactor(@CurrentUser('id') userId: string, @Body() dto: AuthenticatorCodeDto) {
    return this.auth.disableOwnTwoFactor(userId, dto.code);
  }

  @Post('two-factor/recovery-codes')
  @HttpCode(HttpStatus.OK)
  @ForAccounts(AccountScope.ANY)
  regenerateRecoveryCodes(@CurrentUser('id') userId: string, @Body() dto: AuthenticatorCodeDto) {
    return this.auth.regenerateRecoveryCodes(userId, dto.code);
  }

  @Public()
  @authThrottle()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      const tokens = await this.auth.refresh(this.cookies.readRefreshToken(req), this.meta(req));
      this.cookies.set(res, tokens);
      return { success: true };
    } catch (error) {
      this.cookies.clear(res);
      throw error;
    }
  }

  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(this.cookies.readRefreshToken(req));
    this.cookies.clear(res);
  }

  @Get('me')
  @ForAccounts(AccountScope.ANY)
  me(@CurrentUser() principal: Principal) {
    return this.auth.me(principal.id, principal.organizationId);
  }

  private meta(req: Request): ClientMeta {
    return { userAgent: req.get('user-agent'), ipAddress: req.ip };
  }
}
