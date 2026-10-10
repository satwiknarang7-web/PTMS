'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
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
import { useChangePassword, useUpdateProfile } from '../api';

export function ProfileView() {
  const { data: user } = useSession();
  const update = useUpdateProfile();
  const [values, setValues] = useState({ firstName: '', lastName: '', jobTitle: '', avatarUrl: '' });

  useEffect(() => {
    if (user) setValues({ firstName: user.firstName, lastName: user.lastName, jobTitle: user.jobTitle ?? '', avatarUrl: user.avatarUrl ?? '' });
  }, [user]);

  if (!user) return <Spinner />;

  return (
    <>
      <PageHeader title="My profile" description="Manage your personal details and password." />
      <div className="max-w-4xl space-y-4">
        <Card>
          <CardBody className="flex flex-wrap items-center gap-4">
            <Avatar user={user} size="lg" />
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
          <CollapsibleCard storageKey="profile.details" title="Personal details" description="Name, job title and avatar shown to your teammates." bodyClassName="grid gap-4 p-[var(--card-p)] sm:grid-cols-2">
              <Field label="First name">
                <Input value={values.firstName} onChange={(e) => setValues({ ...values, firstName: e.target.value })} />
              </Field>
              <Field label="Last name">
                <Input value={values.lastName} onChange={(e) => setValues({ ...values, lastName: e.target.value })} />
              </Field>
              <Field label="Job title">
                <Input value={values.jobTitle} onChange={(e) => setValues({ ...values, jobTitle: e.target.value })} />
              </Field>
              <Field label="Avatar URL">
                <Input type="url" placeholder="https://…" value={values.avatarUrl} onChange={(e) => setValues({ ...values, avatarUrl: e.target.value })} />
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
                      avatarUrl: values.avatarUrl.trim() || null,
                    })
                  }
                >
                  Save profile
                </Button>
              </div>
          </CollapsibleCard>
          <ChangePasswordCard />
        </div>
      </div>
    </>
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
          <Input type="password" autoComplete="current-password" value={values.currentPassword} onChange={(e) => setValues({ ...values, currentPassword: e.target.value })} />
        </Field>
        <Field label="New password">
          <Input type="password" autoComplete="new-password" value={values.newPassword} onChange={(e) => setValues({ ...values, newPassword: e.target.value })} />
        </Field>
        <Field label="Confirm new password">
          <Input type="password" autoComplete="new-password" value={values.confirm} onChange={(e) => setValues({ ...values, confirm: e.target.value })} />
        </Field>
        <div className="sm:col-span-3">
          <Button onClick={submit} loading={change.isPending} disabled={!values.currentPassword || !values.newPassword}>
            Update password
          </Button>
        </div>
    </CollapsibleCard>
  );
}
