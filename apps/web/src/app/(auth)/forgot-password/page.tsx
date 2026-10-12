import { ArrowLeft, KeyRound, ShieldCheck, Smartphone } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/features/auth/components/auth-shell';
import { routes } from '@/shared/config/routes';

export const metadata: Metadata = { title: 'Forgot password' };

const HELP = [
  {
    icon: KeyRound,
    title: 'Forgot your password',
    body: 'Ask your project coordinator to reset it under Settings → Users. Coordinators ask a root admin. You can change it afterwards from your profile.',
  },
  {
    icon: Smartphone,
    title: 'Lost or replaced your phone',
    body: 'Sign in with one of your recovery codes, or ask an admin to reset your two-step sign-in. You will scan a new QR code at your next sign-in.',
  },
];

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Can't sign in?" subtitle="For security, passwords and two-step sign-in are reset by an administrator.">
      <ul className="space-y-3">
        {HELP.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex gap-3 rounded-ui-lg border border-border bg-surface-muted p-4">
            <Icon className="mt-0.5 size-5 shrink-0 text-brand" />
            <span>
              <span className="block text-sm font-semibold">{title}</span>
              <span className="mt-1 block text-sm text-muted">{body}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-5 flex items-center gap-2 text-xs text-muted">
        <ShieldCheck className="size-4 shrink-0" />
        Resetting signs the account out on every device.
      </p>
      <p className="mt-6 text-center text-sm">
        <Link href={routes.login} className="inline-flex items-center gap-1.5 font-medium text-brand hover:underline">
          <ArrowLeft className="size-3.5" /> Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
