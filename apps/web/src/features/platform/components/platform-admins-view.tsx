'use client';

import { KeyRound, ShieldCheck, UserCheck, UserPlus, UserX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSession } from '@/features/auth/api';
import { errorMessage } from '@/shared/lib/api-client';
import { formatDateTime, fullName } from '@/shared/lib/utils';
import { Avatar } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { EmptyState, ErrorState, Spinner } from '@/shared/ui/feedback';
import { Field, FormAlert, Input } from '@/shared/ui/form';
import { PageHeader } from '@/shared/ui/layout';
import { ConfirmDialog, Modal } from '@/shared/ui/modal';
import { Table, Td, Th, Tr } from '@/shared/ui/table';
import { ResetAccessDialog } from '@/features/users/components/reset-access-dialog';
import { useCreatePlatformAdmin, usePlatformAdmins, useResetPlatformAdminPassword, useResetPlatformAdminTwoFactor, useUpdatePlatformAdmin } from '../api';
import type { PlatformAdmin } from '../types';

/** Root admins create organizations, appoint project coordinators and add other root admins. */
export function PlatformAdminsView() {
  const { data: session } = useSession();
  const { data, isLoading, isError, error, refetch } = usePlatformAdmins();
  const update = useUpdatePlatformAdmin();
  const resetPassword = useResetPlatformAdminPassword();
  const resetTwoFactor = useResetPlatformAdminTwoFactor();
  const [resettingAccess, setResettingAccess] = useState<PlatformAdmin | null>(null);
  const [adding, setAdding] = useState(false);
  const [deactivating, setDeactivating] = useState<PlatformAdmin | null>(null);

  return (
    <>
      <PageHeader
        title="Root admins"
        description="Root admins manage every organization, appoint project coordinators and can add other root admins."
        actions={
          <Button onClick={() => setAdding(true)}>
            <UserPlus /> Add root admin
          </Button>
        }
      />
      <Card>
        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <ErrorState message={errorMessage(error)} onRetry={refetch} />
        ) : !data?.length ? (
          <EmptyState icon={<ShieldCheck />} title="No root admins" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Status</Th>
                <Th>Last sign-in</Th>
                <Th className="w-48" />
              </tr>
            </thead>
            <tbody>
              {data.map((admin) => (
                <Tr key={admin.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar user={admin} />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-foreground">
                          {fullName(admin)} {admin.id === session?.id && <span className="text-xs font-normal text-muted">(you)</span>}
                        </span>
                        <span className="block truncate text-xs text-muted">{admin.email}</span>
                      </span>
                    </div>
                  </Td>
                  <Td>
                    {!admin.isActive ? (
                      <Badge tone="danger">Deactivated</Badge>
                    ) : admin.twoFactorEnabledAt ? (
                      <Badge tone="success">Active</Badge>
                    ) : (
                      <Badge tone="warning">2-step pending</Badge>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-muted">{formatDateTime(admin.lastLoginAt)}</Td>
                  <Td>
                    {admin.id !== session?.id && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setResettingAccess(admin)}>
                          <KeyRound /> Reset access
                        </Button>
                        {admin.isActive ? (
                          <Button size="sm" variant="ghost" onClick={() => setDeactivating(admin)}>
                            <UserX /> Deactivate
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" loading={update.isPending && update.variables?.id === admin.id} onClick={() => update.mutate({ id: admin.id, isActive: true })}>
                            <UserCheck /> Reactivate
                          </Button>
                        )}
                      </div>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <AddAdminModal open={adding} onClose={() => setAdding(false)} />
      <ResetAccessDialog
        person={resettingAccess}
        onClose={() => setResettingAccess(null)}
        passwordPending={resetPassword.isPending}
        twoFactorPending={resetTwoFactor.isPending}
        onResetPassword={(password, done) => resettingAccess && resetPassword.mutate({ id: resettingAccess.id, password }, { onSuccess: done })}
        onResetTwoFactor={(done) => resettingAccess && resetTwoFactor.mutate(resettingAccess.id, { onSuccess: done })}
      />
      <ConfirmDialog
        open={!!deactivating}
        onClose={() => setDeactivating(null)}
        title="Deactivate root admin?"
        message={deactivating ? `${fullName(deactivating)} will be signed out and can no longer sign in. You can reactivate them later.` : undefined}
        confirmLabel="Deactivate"
        loading={update.isPending}
        onConfirm={() => deactivating && update.mutate({ id: deactivating.id, isActive: false }, { onSuccess: () => setDeactivating(null) })}
      />
    </>
  );
}

const EMPTY = { firstName: '', lastName: '', email: '', password: '' };

function AddAdminModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreatePlatformAdmin();
  const [values, setValues] = useState(EMPTY);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setValues(EMPTY);
      setError('');
    }
  }, [open]);

  const set = (key: keyof typeof EMPTY) => (event: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: event.target.value }));
  const submit = () => {
    if (Object.values(values).some((v) => !v.trim())) return setError('All fields are required');
    create.mutate(
      { firstName: values.firstName.trim(), lastName: values.lastName.trim(), email: values.email.trim(), password: values.password },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add root admin"
      description="Root admins have full platform access: every organization, coordinators and other root admins."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            Add root admin
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {(error || create.isError) && (
          <div className="sm:col-span-2">
            <FormAlert>{error || errorMessage(create.error)}</FormAlert>
          </div>
        )}
        <Field label="First name" required>
          <Input autoFocus value={values.firstName} onChange={set('firstName')} />
        </Field>
        <Field label="Last name" required>
          <Input value={values.lastName} onChange={set('lastName')} />
        </Field>
        <Field label="Email" required className="sm:col-span-2">
          <Input type="email" value={values.email} onChange={set('email')} />
        </Field>
        <Field label="Initial password" required hint="Share it securely. They set up their authenticator app at the first sign-in." className="sm:col-span-2">
          <Input type="password" autoComplete="new-password" value={values.password} onChange={set('password')} />
        </Field>
      </div>
    </Modal>
  );
}
