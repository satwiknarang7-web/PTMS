import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthShell } from '@/features/auth/components/auth-shell';
import { ResetPasswordForm } from '@/features/auth/components/reset-password-form';

export const metadata: Metadata = { title: 'Set your password' };

export default function ResetPasswordPage() {
  return (
    <AuthShell title="Set your password" subtitle="Choose the password you'll use to sign in.">
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
