'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, Copy, Download, KeyRound, ShieldCheck, Smartphone } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { appConfig } from '@/shared/config/env';
import { errorMessage } from '@/shared/lib/api-client';
import { Button } from '@/shared/ui/button';
import { Checkbox, Field, FormAlert, Input } from '@/shared/ui/form';
import { Spinner } from '@/shared/ui/feedback';
import { authApi } from '../api';

function StepHeader({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <span className="flex size-10 items-center justify-center rounded-ui-lg bg-brand-soft text-brand [&_svg]:size-5">{icon}</span>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted">{children}</p>
    </div>
  );
}

/** Six-digit input that submits by itself once complete (authenticator apps and SMS autofill friendly). */
function CodeInput({ value, onChange, onComplete, disabled }: { value: string; onChange: (v: string) => void; onComplete: (v: string) => void; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <Input
      ref={ref}
      id="two-factor-code"
      inputMode="numeric"
      autoComplete="one-time-code"
      placeholder="000000"
      maxLength={6}
      disabled={disabled}
      className="h-12 text-center font-mono text-2xl tracking-[0.5em]"
      value={value}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 6);
        onChange(digits);
        if (digits.length === 6) onComplete(digits);
      }}
    />
  );
}

/** Sign-in step 2: the code from the authenticator app (or a one-time recovery code). */
export function TwoFactorCodeStep({ challenge, onSuccess, onBack }: { challenge: string; onSuccess: () => void; onBack: () => void }) {
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const verify = useMutation({
    mutationFn: authApi.verifyTwoFactor,
    meta: { silentError: true },
    onSuccess,
    onError: () => setCode(''),
  });
  const submit = (value?: string) =>
    verify.mutate(useRecovery ? { challenge, recoveryCode: recoveryCode.trim() } : { challenge, code: value ?? code });

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <StepHeader icon={useRecovery ? <KeyRound /> : <Smartphone />} title={useRecovery ? 'Use a recovery code' : 'Enter your sign-in code'}>
        {useRecovery
          ? 'Type one of the recovery codes you saved when you set up your authenticator. Each code works once.'
          : `Open your authenticator app and enter the 6-digit code for ${appConfig.name}.`}
      </StepHeader>
      {verify.isError && <FormAlert>{errorMessage(verify.error)}</FormAlert>}
      {useRecovery ? (
        <Field label="Recovery code" htmlFor="recovery-code">
          <Input id="recovery-code" autoFocus autoComplete="off" placeholder="ABCD-EFGH" className="h-11 font-mono uppercase" value={recoveryCode} onChange={(e) => setRecoveryCode(e.target.value)} />
        </Field>
      ) : (
        <CodeInput value={code} onChange={setCode} onComplete={(v) => submit(v)} disabled={verify.isPending} />
      )}
      <Button type="submit" size="lg" className="w-full justify-center" loading={verify.isPending} disabled={useRecovery ? recoveryCode.trim().length < 8 : code.length !== 6}>
        Verify and sign in
      </Button>
      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 font-medium text-muted hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Back
        </button>
        <button
          type="button"
          onClick={() => {
            setUseRecovery((v) => !v);
            verify.reset();
          }}
          className="font-medium text-brand hover:underline"
        >
          {useRecovery ? 'Use the authenticator app' : 'Lost your phone? Use a recovery code'}
        </button>
      </div>
    </form>
  );
}

/** First sign-in: scan the QR code, confirm with a code, then save the recovery codes. */
export function TwoFactorSetupStep({ challenge, onSuccess, onBack }: { challenge: string; onSuccess: () => void; onBack: () => void }) {
  const [code, setCode] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const setup = useQuery({ queryKey: ['auth', 'two-factor-setup', challenge], queryFn: () => authApi.setupTwoFactor(challenge), retry: false, staleTime: Infinity, gcTime: 0 });
  const activate = useMutation({
    mutationFn: authApi.activateTwoFactor,
    meta: { silentError: true },
    onSuccess: (result) => setRecoveryCodes(result.recoveryCodes),
    onError: () => setCode(''),
  });

  if (recoveryCodes) return <RecoveryCodes codes={recoveryCodes} onDone={onSuccess} />;

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        activate.mutate({ challenge, code });
      }}
    >
      <StepHeader icon={<ShieldCheck />} title="Set up two-step sign-in">
        {appConfig.companyName || 'Your organization'} requires a code from an authenticator app each time you sign in. Install Google Authenticator,
        Microsoft Authenticator or Authy, then scan this code with it.
      </StepHeader>
      {setup.isLoading ? (
        <Spinner />
      ) : setup.isError || !setup.data ? (
        <FormAlert>{errorMessage(setup.error)}</FormAlert>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-ui-lg border border-border bg-surface-muted p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
          <img src={setup.data.qrCode} alt="QR code for your authenticator app" width={176} height={176} className="rounded-ui bg-white p-2" />
          {showKey ? (
            <p className="text-center text-xs text-muted">
              Can&apos;t scan? Add an account manually with this key:
              <span className="mt-1 block select-all break-all font-mono text-sm text-foreground">{setup.data.secret}</span>
            </p>
          ) : (
            <button type="button" onClick={() => setShowKey(true)} className="text-xs font-medium text-brand hover:underline">
              Can&apos;t scan the code?
            </button>
          )}
        </div>
      )}
      {activate.isError && <FormAlert>{errorMessage(activate.error)}</FormAlert>}
      <Field label="Enter the 6-digit code the app shows" htmlFor="two-factor-code">
        <CodeInput value={code} onChange={setCode} onComplete={(v) => activate.mutate({ challenge, code: v })} disabled={activate.isPending || !setup.data} />
      </Field>
      <Button type="submit" size="lg" className="w-full justify-center" loading={activate.isPending} disabled={code.length !== 6 || !setup.data}>
        Turn on and continue
      </Button>
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Back
      </button>
    </form>
  );
}

/** One-time recovery codes, shown once; used after setup and when making new ones from the profile. */
export function RecoveryCodes({ codes, onDone, doneLabel = 'Continue to the app' }: { codes: string[]; onDone: () => void; doneLabel?: string }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = codes.join('\n');
  const download = () => {
    const url = URL.createObjectURL(new Blob([`${appConfig.name} recovery codes\nEach code works once.\n\n${text}\n`], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'recovery-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <StepHeader icon={<KeyRound />} title="Save your recovery codes">
        If you lose your phone, each of these codes lets you sign in once. Keep them somewhere safe, such as a password manager. They won&apos;t be shown again.
      </StepHeader>
      <ul className="grid grid-cols-2 gap-2 rounded-ui-lg border border-border bg-surface-muted p-4 font-mono text-sm">
        {codes.map((code) => (
          <li key={code} className="rounded-ui bg-surface px-3 py-1.5 text-center tracking-wider">
            {code}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          className="flex-1 justify-center"
          onClick={async () => {
            await navigator.clipboard?.writeText(text);
            setCopied(true);
          }}
        >
          {copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button type="button" variant="secondary" className="flex-1 justify-center" onClick={download}>
          <Download /> Download
        </Button>
      </div>
      <Checkbox id="saved-codes" label="I have saved my recovery codes" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
      <Button type="button" size="lg" className="w-full justify-center" disabled={!saved} onClick={onDone}>
        {doneLabel}
      </Button>
    </div>
  );
}
