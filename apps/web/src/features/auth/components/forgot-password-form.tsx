'use client';

import { ArrowLeft, Mail, MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { routes } from '@/shared/config/routes';
import { errorMessage } from '@/shared/lib/api-client';
import { Button } from '@/shared/ui/button';
import { Field, FormAlert, Input } from '@/shared/ui/form';
import { authApi } from '../api';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const request = useMutation({ mutationFn: authApi.forgotPassword, meta: { silentError: true } });

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter a valid email');
    setError(null);
    request.mutate(email.trim());
  };

  if (request.isSuccess) {
    return (
      <div className="space-y-5">
        <FormAlert tone="success">
          <span className="flex gap-2">
            <MailCheck className="mt-0.5 size-4 shrink-0" />
            If an account exists for {email.trim()}, a reset link is on its way. Check your inbox (and spam folder).
          </span>
        </FormAlert>
        <BackToSignIn />
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {request.isError && <FormAlert>{errorMessage(request.error)}</FormAlert>}
      <Field label="Work email" htmlFor="email" error={error ?? undefined}>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="name@company.com"
            className="h-11 pl-9"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </Field>
      <Button type="submit" size="lg" className="w-full justify-center" loading={request.isPending}>
        Send reset link
      </Button>
      <BackToSignIn />
    </form>
  );
}

function BackToSignIn() {
  return (
    <p className="text-center text-sm">
      <Link href={routes.login} className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline">
        <ArrowLeft className="size-3.5" /> Back to sign in
      </Link>
    </p>
  );
}
