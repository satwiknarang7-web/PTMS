import type { Metadata } from 'next';
import { AuthShell } from '@/features/auth/components/auth-shell';
import { ForgotPasswordForm } from '@/features/auth/components/forgot-password-form';

export const metadata: Metadata = { title: 'Forgot password' };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Forgot your password?" subtitle="Enter your work email and we'll send you a link to choose a new one.">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
