'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { appConfig } from '@/shared/config/env';
import { routes } from '@/shared/config/routes';
import { PLATFORM_ROOT_ROLE } from '@/shared/constants/domain';
import { errorMessage } from '@/shared/lib/api-client';
import { Button } from '@/shared/ui/button';
import { Checkbox, Field, FormAlert, Input } from '@/shared/ui/form';
import { authApi, useAuthConfig, useLogin } from '../api';
import { TwoFactorCodeStep, TwoFactorSetupStep } from './two-factor-steps';
import { loginSchema, type LoginValues } from '../schemas';

/** Only allow same-app relative redirects after login. */
function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : routes.home;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useLogin();
  const { data: config } = useAuthConfig();
  const [showPassword, setShowPassword] = useState(false);
  /** After the password: enter an authenticator code, or set the app up on the first sign-in. */
  const [step, setStep] = useState<{ kind: 'code' | 'setup'; challenge: string } | null>(null);
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', remember: false },
  });
  const { errors, isSubmitting } = form.formState;

  /** Session is set: go to the platform console (root) or where the person was heading. */
  const finish = async () => {
    const me = await authApi.me();
    router.replace(me.role === PLATFORM_ROOT_ROLE ? routes.platform : safeNext(searchParams.get('next')));
    router.refresh();
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const result = await login.mutateAsync(values);
      if (result.status === 'ok') return await finish();
      setStep({ kind: result.status === 'two_factor_required' ? 'code' : 'setup', challenge: result.challenge });
    } catch {
      return; // surfaced through login.error
    }
  });

  if (step) {
    const back = () => {
      setStep(null);
      form.setValue('password', '');
    };
    return step.kind === 'code' ? (
      <TwoFactorCodeStep challenge={step.challenge} onSuccess={finish} onBack={back} />
    ) : (
      <TwoFactorSetupStep challenge={step.challenge} onSuccess={finish} onBack={back} />
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {login.isError && <FormAlert>{errorMessage(login.error)}</FormAlert>}

      <Field label="Work email" htmlFor="email" error={errors.email?.message}>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input id="email" type="email" autoComplete="email" autoFocus placeholder="name@company.com" className="h-11 pl-9" {...form.register('email')} />
        </div>
      </Field>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="password" className="text-[13px] font-medium text-foreground-soft">
            Password
          </label>
          <Link href={routes.forgotPassword} className="text-xs font-medium text-brand hover:underline">
            Forgot password?
          </Link>
        </div>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="••••••••••"
            aria-invalid={!!errors.password}
            className="h-11 px-9"
            {...form.register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-ui text-muted transition-colors hover:text-foreground"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        {errors.password && <p className="mt-1.5 text-xs text-danger">{errors.password.message}</p>}
      </div>

      <Checkbox
        id="remember"
        label={config ? `Keep me signed in for ${config.rememberMeDays} days` : 'Keep me signed in'}
        {...form.register('remember')}
      />

      <Button type="submit" size="lg" className="w-full justify-center" loading={isSubmitting}>
        Sign in {!isSubmitting && <ArrowRight />}
      </Button>

      <p className="text-center text-sm text-muted">
        New here? Ask your project coordinator for an account.
        {appConfig.supportEmail && (
          <>
            {' '}
            <a href={`mailto:${appConfig.supportEmail}`} className="font-medium text-brand hover:underline">
              Contact support
            </a>
          </>
        )}
      </p>
    </form>
  );
}
