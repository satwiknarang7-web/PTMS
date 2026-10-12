'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuthConfig, useLogout, useSession } from '@/features/auth/api';
import { passwordSchema } from '@/features/auth/schemas';
import { routes } from '@/shared/config/routes';
import { errorMessage } from '@/shared/lib/api-client';
import { roleLabel } from '@/shared/constants/domain';
import { formatDateTime } from '@/shared/lib/utils';
import { Avatar } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardBody } from '@/shared/ui/card';
import { CollapsibleCard } from '@/shared/ui/collapsible';
import { Spinner } from '@/shared/ui/feedback';
import { Field, Input } from '@/shared/ui/form';
import { PageHeader } from '@/shared/ui/layout';
import { squarePhoto, useChangePassword, useSetProfilePhoto, useUpdateProfile } from '../api';
import { Camera } from 'lucide-react';
import { toast } from 'sonner';
import { useMutation, useQuery } from '@tanstack/react-query';
import { authApi } from '@/features/auth/api';
import { AuthenticatorSetup, RecoveryCodes } from '@/features/auth/components/two-factor-steps';
import { FormAlert } from '@/shared/ui/form';

export function ProfileView() {
  const { data: user } = useSession();
  const update = useUpdateProfile();
  const [values, setValues] = useState({ firstName: '', lastName: '', jobTitle: '' });

  useEffect(() => {
    if (user)
      setValues({
        firstName: user.firstName,
        lastName: user.lastName,
        jobTitle: user.jobTitle ?? '',
      });
  }, [user]);

  if (!user) return <Spinner />;

  return (
    <>
      <PageHeader title="My profile" description="Manage your personal details and password." />
      <div className="max-w-4xl space-y-4">
        <Card>
          <CardBody className="flex flex-wrap items-center gap-4">
            <ProfilePhoto user={user} />
            <div className="min-w-0 flex-1 basis-40">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {user.firstName} {user.lastName}
                <Badge tone="brand">{roleLabel(user.role)}</Badge>
              </p>
              <p className="truncate text-sm text-muted">{user.email}</p>
            </div>
            <p className="w-full text-xs text-muted sm:w-auto">Member since {formatDateTime(user.createdAt)}</p>
          </CardBody>
        </Card>
        <div className="space-y-4">
          <CollapsibleCard
            storageKey="profile.details"
            title="Personal details"
            description="Name and job title shown to your teammates."
            bodyClassName="grid gap-4 p-[var(--card-p)] sm:grid-cols-2"
          >
            <Field label="First name">
              <Input value={values.firstName} onChange={(e) => setValues({ ...values, firstName: e.target.value })} />
            </Field>
            <Field label="Last name">
              <Input value={values.lastName} onChange={(e) => setValues({ ...values, lastName: e.target.value })} />
            </Field>
            <Field label="Job title">
              <Input value={values.jobTitle} onChange={(e) => setValues({ ...values, jobTitle: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <Button
                loading={update.isPending}
                disabled={!values.firstName.trim() || !values.lastName.trim()}
                onClick={() =>
                  update.mutate({
                    firstName: values.firstName.trim(),
                    lastName: values.lastName.trim(),
                    jobTitle: values.jobTitle.trim() || null,
                  })
                }
              >
                Save profile
              </Button>
            </div>
          </CollapsibleCard>
          <ChangePasswordCard />
          <TwoFactorCard />
        </div>
      </div>
    </>
  );
}

/** The avatar with buttons to upload a new photo or remove it. */
function ProfilePhoto({ user }: { user: { firstName: string; lastName: string; avatarUrl?: string | null } }) {
  const setPhoto = useSetProfilePhoto();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className="group relative rounded-full"
        aria-label="Change profile photo"
        title="Change profile photo"
      >
        <Avatar user={user} size="lg" />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition group-hover:opacity-100">
          <Camera className="size-5" />
        </span>
      </button>
      <div className="flex flex-col items-start gap-1">
        <Button size="sm" variant="secondary" loading={setPhoto.isPending} onClick={() => input.current?.click()}>
          <Camera /> {user.avatarUrl ? 'Change photo' : 'Add photo'}
        </Button>
        {user.avatarUrl && (
          <button type="button" className="text-xs font-medium text-muted hover:text-danger" onClick={() => setPhoto.mutate(null)}>
            Remove photo
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            setPhoto.mutate(await squarePhoto(file));
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'This image could not be read');
          }
        }}
      />
    </div>
  );
}

function ChangePasswordCard() {
  const router = useRouter();
  const { data: config } = useAuthConfig();
  const change = useChangePassword();
  const logout = useLogout();
  const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');

  const submit = () => {
    setError('');
    const parsed = passwordSchema(config?.passwordPolicy.minLength ?? 1).safeParse(values.newPassword);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Invalid password');
    if (values.newPassword !== values.confirm) return setError('Passwords do not match');
    change.mutate(
      { currentPassword: values.currentPassword, newPassword: values.newPassword },
      {
        onSuccess: () =>
          logout.mutate(undefined, {
            onSettled: () => router.replace(`${routes.login}?next=${encodeURIComponent(routes.profile)}`),
          }),
        onError: (err) => setError(errorMessage(err)),
      },
    );
  };

  return (
    <CollapsibleCard
      storageKey="profile.password"
      defaultOpen={false}
      title="Change password"
      description="You will be signed out of all devices after changing it."
      bodyClassName="grid gap-4 p-[var(--card-p)] sm:grid-cols-3"
    >
      {error && <p className="text-sm text-danger sm:col-span-3">{error}</p>}
      <Field label="Current password">
        <Input
          type="password"
          autoComplete="current-password"
          value={values.currentPassword}
          onChange={(e) => setValues({ ...values, currentPassword: e.target.value })}
        />
      </Field>
      <Field label="New password">
        <Input
          type="password"
          autoComplete="new-password"
          value={values.newPassword}
          onChange={(e) => setValues({ ...values, newPassword: e.target.value })}
        />
      </Field>
      <Field label="Confirm new password">
        <Input
          type="password"
          autoComplete="new-password"
          value={values.confirm}
          onChange={(e) => setValues({ ...values, confirm: e.target.value })}
        />
      </Field>
      <div className="sm:col-span-3">
        <Button onClick={submit} loading={change.isPending} disabled={!values.currentPassword || !values.newPassword}>
          Update password
        </Button>
      </div>
    </CollapsibleCard>
  );
}

/** Two-step sign-in: turn it on or off (when root has not made it required) and make fresh recovery codes. */
function TwoFactorCard() {
  const status = useQuery({ queryKey: ['auth', 'two-factor'], queryFn: authApi.twoFactorStatus });
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [settingUp, setSettingUp] = useState(0);
  const regenerate = useMutation({
    mutationFn: authApi.regenerateRecoveryCodes,
    meta: { silentError: true },
    onSuccess: (result) => {
      setCodes(result.recoveryCodes);
      setCode('');
      void status.refetch();
    },
  });
  const disable = useMutation({
    mutationFn: authApi.disableOwnTwoFactor,
    meta: { silentError: true, successMessage: 'Two-step sign-in turned off' },
    onSuccess: () => {
      setCode('');
      void status.refetch();
    },
  });
  const data = status.data;
  const codeValid = code.length === 6;

  return (
    <CollapsibleCard
      storageKey="profile.two-factor"
      defaultOpen={false}
      title="Two-step sign-in"
      description={
        data?.enabled
          ? `On since ${formatDateTime(data.enabledAt)} · ${data.recoveryCodesLeft} recovery code${data.recoveryCodesLeft === 1 ? '' : 's'} left`
          : data?.required
            ? 'Not set up yet: you will scan a QR code at your next sign-in.'
            : 'Off: you sign in with your password only.'
      }
      bodyClassName="space-y-4 p-[var(--card-p)]"
    >
      {codes ? (
        <RecoveryCodes codes={codes} onDone={() => setCodes(null)} doneLabel="Done" />
      ) : settingUp ? (
        <div className="max-w-md">
          <AuthenticatorSetup
            setupKey={`profile-${settingUp}`}
            load={authApi.beginOwnTwoFactor}
            activate={authApi.confirmOwnTwoFactor}
            intro="Each sign-in will also ask for a code from an authenticator app on your phone."
            submitLabel="Turn on"
            doneLabel="Done"
            onDone={() => {
              setSettingUp(0);
              void status.refetch();
            }}
            onBack={() => setSettingUp(0)}
          />
        </div>
      ) : data?.enabled ? (
        <>
          <p className="text-sm text-muted">
            Each sign-in asks for a code from your authenticator app. Recovery codes let you sign in once each if you
            lose your phone. Make new ones if you have used some or think they were seen; the old ones stop working.
            Lost your phone? Ask an admin to reset two-step sign-in.
          </p>
          {regenerate.isError && <FormAlert>{errorMessage(regenerate.error)}</FormAlert>}
          {disable.isError && <FormAlert>{errorMessage(disable.error)}</FormAlert>}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field label="Code from your authenticator app" className="sm:w-56">
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </Field>
            <Button variant="secondary" disabled={!codeValid} loading={regenerate.isPending} onClick={() => regenerate.mutate(code)}>
              Make new recovery codes
            </Button>
            {!data.required && (
              <Button variant="danger" disabled={!codeValid} loading={disable.isPending} onClick={() => disable.mutate(code)}>
                Turn off
              </Button>
            )}
          </div>
          {data.required && <p className="text-xs text-muted">Your administrator requires two-step sign-in, so it cannot be turned off.</p>}
        </>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted">
            {data?.required
              ? 'Your administrator requires two-step sign-in. Set it up now, or you will be asked at your next sign-in.'
              : 'Add a code from an authenticator app to your sign-in, so a stolen password alone is not enough.'}
          </p>
          <Button onClick={() => setSettingUp(Date.now())} disabled={!data}>
            Turn on
          </Button>
        </div>
      )}
    </CollapsibleCard>
  );
}
