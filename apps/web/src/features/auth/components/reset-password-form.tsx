'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { routes } from '@/shared/config/routes';
import { errorMessage } from '@/shared/lib/api-client';
import { Button } from '@/shared/ui/button';
import { Field, FormAlert } from '@/shared/ui/form';
import { authApi, usePasswordMinLength } from '../api';
import { passwordSchema } from '../schemas';
import { PasswordInput } from './password-input';

/** Sets a password from an invitation or password reset link (?token=…). */
export function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const minLength = usePasswordMinLength();
  const [values, setValues] = useState({ password: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);

  const link = useQuery({
    queryKey: ['auth', 'link', token],
    queryFn: () => authApi.verifyToken(token),
    enabled: token.length > 0,
    retry: false,
    staleTime: Infinity,
  });
  const reset = useMutation({
    mutationFn: authApi.resetPassword,
    meta: { silentError: true },
    onSuccess: () => router.replace(`${routes.login}?reset=1`),
  });

  if (!token || link.isError) {
    return (
      <div className="space-y-5">
        <FormAlert>{token ? errorMessage(link.error) : 'This link is incomplete. Open it again from your email.'}</FormAlert>
        <p className="text-center text-sm">
          <Link href={routes.forgotPassword} className="font-medium text-brand hover:underline">
            Send me a new link
          </Link>
        </p>
      </div>
    );
  }

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = passwordSchema(minLength).safeParse(values.password);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Invalid password');
    if (values.password !== values.confirm) return setError('Passwords do not match');
    setError(null);
    reset.mutate({ token, password: values.password });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {link.data && (
        <p className="rounded-ui bg-surface-muted px-3 py-2 text-sm text-foreground-soft">
          {link.data.purpose === 'INVITE' ? `Welcome, ${link.data.firstName}! ` : `Hi ${link.data.firstName}, `}
          you'll sign in as <span className="font-medium text-foreground">{link.data.email}</span>.
        </p>
      )}
      {reset.isError && <FormAlert>{errorMessage(reset.error)}</FormAlert>}
      <Field label="New password" htmlFor="password" error={error ?? undefined} hint={`At least ${minLength} characters, with upper-case, lower-case letters and a number.`}>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          autoFocus
          className="h-11"
          value={values.password}
          onChange={(e) => setValues({ ...values, password: e.target.value })}
        />
      </Field>
      <Field label="Confirm password" htmlFor="confirm">
        <PasswordInput id="confirm" autoComplete="new-password" className="h-11" value={values.confirm} onChange={(e) => setValues({ ...values, confirm: e.target.value })} />
      </Field>
      <Button type="submit" size="lg" className="w-full justify-center" loading={reset.isPending} disabled={link.isLoading}>
        {link.data?.purpose === 'INVITE' ? 'Activate account' : 'Save new password'}
      </Button>
      <p className="text-center text-sm">
        <Link href={routes.login} className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline">
          <ArrowLeft className="size-3.5" /> Back to sign in
        </Link>
      </p>
    </form>
  );
}
