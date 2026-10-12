'use client';

import { Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { usePasswordMinLength } from '@/features/auth/api';
import { passwordSchema } from '@/features/auth/schemas';
import { fullName } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Field, Input } from '@/shared/ui/form';
import { Modal } from '@/shared/ui/modal';

interface Person {
  firstName: string;
  lastName: string;
  email: string;
  twoFactorEnabledAt: string | null;
}

interface ResetAccessDialogProps {
  person: Person | null;
  onClose: () => void;
  onResetPassword: (password: string, done: () => void) => void;
  onResetTwoFactor: (done: () => void) => void;
  passwordPending?: boolean;
  twoFactorPending?: boolean;
}

/** Gets someone back in without email: a new password and/or a fresh authenticator setup. */
export function ResetAccessDialog({ person, onClose, onResetPassword, onResetTwoFactor, passwordPending, twoFactorPending }: ResetAccessDialogProps) {
  const minLength = usePasswordMinLength();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setPassword('');
    setError('');
  }, [person]);

  const submitPassword = () => {
    const parsed = passwordSchema(minLength).safeParse(password);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Invalid password');
    onResetPassword(password, onClose);
  };

  return (
    <Modal open={!!person} onClose={onClose} title={person ? `Reset access for ${fullName(person)}` : 'Reset access'} description={person?.email}>
      <div className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">New password</h3>
          <Field error={error} hint="Share it with them securely. They are signed out everywhere and can change it from their profile.">
            <Input type="password" autoComplete="new-password" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button onClick={submitPassword} loading={passwordPending} disabled={!password}>
            Set new password
          </Button>
        </section>
        <section className="space-y-3 border-t border-border pt-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Smartphone className="size-4 text-muted" /> Two-step sign-in
          </h3>
          {person?.twoFactorEnabledAt ? (
            <>
              <p className="text-sm text-muted">If they lost or replaced their phone, reset it: they scan a new QR code at their next sign-in.</p>
              <Button variant="secondary" onClick={() => onResetTwoFactor(onClose)} loading={twoFactorPending}>
                Reset two-step sign-in
              </Button>
            </>
          ) : (
            <p className="text-sm text-muted">Not set up yet. They will scan a QR code at their next sign-in.</p>
          )}
        </section>
      </div>
    </Modal>
  );
}
