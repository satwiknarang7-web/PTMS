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
import { requestOrigin } from '../../common/utils/request.util';
import { AccountLinksService } from '../users/account-links.service';
import { ForgotPasswordDto, LoginDto, SetPasswordDto, TokenDto } from './dto/auth.dto';
import { LoginAttemptsService } from './login-attempts.service';
import { ClientMeta } from './token.service';

/** Stricter rate limit for credential endpoints; resolved lazily at request time once env is loaded. */
const authThrottle = () =>
  Throttle({
    default: {
      limit: () => configuration().throttle.authLimit,
      ttl: () => configuration().throttle.ttlMs,
    },
  });

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly cookies: AuthCookieService,
    private readonly links: AccountLinksService,
    private readonly attempts: LoginAttemptsService,
  ) {}

  @Public()
  @Get('config')
  config() {
    return this.auth.publicConfig();
  }

  @Public()
  @authThrottle()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.auth.login(dto, this.meta(req));
    this.cookies.set(res, tokens);
    this.cookies.clearWorkspace(res);
    return { success: true };
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

  /** Emails a reset link when the account exists; the response is the same either way. */
  @Public()
  @authThrottle()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    await this.links.requestPasswordReset(dto.email, requestOrigin(req));
  }

  /** Checks an invitation or reset link before the user chooses a password. */
  @Public()
  @authThrottle()
  @HttpCode(HttpStatus.OK)
  @Post('verify-token')
  verifyToken(@Body() dto: TokenDto) {
    return this.links.inspect(dto.token);
  }

  /** Sets a password from an invitation or reset link; every existing session is signed out. */
  @Public()
  @authThrottle()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('reset-password')
  async resetPassword(@Body() dto: SetPasswordDto) {
    const { email } = await this.links.consume(dto.token, dto.password);
    this.attempts.reset(email);
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
