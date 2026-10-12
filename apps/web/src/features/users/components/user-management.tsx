'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowUpDown, Eye, KeyRound, Mail, Pencil, Plus, Search, Trash2, UserCheck, UserX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { usePasswordMinLength, useSession } from '@/features/auth/api';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { passwordSchema } from '@/features/auth/schemas';
import { FilterPopover } from '@/shared/components/filter-popover';
import { RowMenu } from '@/shared/components/row-menu';
import { appConfig } from '@/shared/config/env';
import { routes } from '@/shared/config/routes';
import { ORG_ROLES, OrgRole, Permission, PLATFORM_ROOT_ROLE, roleLabel } from '@/shared/constants/domain';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { errorMessage } from '@/shared/lib/api-client';
import { formatDateTime, fullName } from '@/shared/lib/utils';
import { Avatar } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardHeader } from '@/shared/ui/card';
import { DropdownItem, DropdownSeparator } from '@/shared/ui/dropdown';
import { ErrorState, Spinner } from '@/shared/ui/feedback';
import { Field, Input, Select } from '@/shared/ui/form';
import { Pagination } from '@/shared/ui/layout';
import { Modal } from '@/shared/ui/modal';
import { Table, Td, Th, Tr } from '@/shared/ui/table';
import { useActiveUsers, useCreateUser, useRemoveUser, useResetPassword, useSendInvite, useUpdateUser, useUsers } from '../api';
import { RemovePersonDialog } from './remove-person-dialog';
import type { User } from '../types';

const STATUS_LABELS: Record<string, string> = { active: 'Active', inactive: 'Deactivated', all: 'All statuses' };

export function UserManagement() {
  const { can } = usePermissions();
  const { data: session } = useSession();
  const canManage = can(Permission.USERS_MANAGE);
  const canManageCoordinators = can(Permission.COORDINATORS_MANAGE);
  /** Coordinators manage member accounts; only root changes coordinators. */
  const canEditUser = (user: User) => canManage && (canManageCoordinators || user.role !== OrgRole.PROJECT_COORDINATOR);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const debounced = useDebounce(search);
  const update = useUpdateUser();
  const invite = useSendInvite();
  const remove = useRemoveUser();
  const [removing, setRemoving] = useState<User | null>(null);
  /** Only root admins remove people for good; coordinators deactivate them. */
  const canRemove = session?.role === PLATFORM_ROOT_ROLE;
  const { data: activePeople } = useActiveUsers();
  const router = useRouter();

  useEffect(() => setPage(1), [debounced, role, status]);

  const { data, isLoading, isError, error, refetch } = useUsers({
    search: debounced || undefined,
    role: (role || undefined) as OrgRole | undefined,
    isActive: status === 'all' ? undefined : status === 'active',
    page,
    limit: appConfig.defaultPageSize,
  });

  return (
    <Card>
      <CardHeader
        title="Users"
        description={canManageCoordinators ? 'People in this organization. Appoint project coordinators here.' : 'People in your organization. Only the root account can change project coordinators.'}
        actions={
          canManage && (
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus className="size-3.5" /> Add user
            </Button>
          )
        }
      />
      <div className="flex flex-wrap gap-2 border-b border-border px-[var(--card-p)] py-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Search people" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <FilterPopover
          summary={[role ? roleLabel(role as OrgRole) : 'All roles', STATUS_LABELS[status]].join(' · ')}
          activeCount={(role ? 1 : 0) + (status !== 'active' ? 1 : 0)}
          onReset={() => {
            setRole('');
            setStatus('active');
          }}
        >
          <Field label="Role">
            <Select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">All roles</option>
              {ORG_ROLES.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </FilterPopover>
      </div>
      {isLoading ? (
        <Spinner />
      ) : isError || !data ? (
        <ErrorState message={errorMessage(error)} onRetry={refetch} />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Role</Th>
                <Th>Job title</Th>
                <Th>Status</Th>
                <Th>Last sign-in</Th>
                {canManage && <Th className="w-12" />}
              </tr>
            </thead>
            <tbody>
              {data.data.map((user) => (
                <Tr key={user.id}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar user={user} />
                      <div>
                        <p className="font-medium">
                          {fullName(user)} {user.id === session?.id && <span className="text-xs text-muted">(you)</span>}
                        </p>
                        <p className="text-xs text-muted">{user.email}</p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={user.role === OrgRole.PROJECT_COORDINATOR ? 'brand' : 'neutral'}>{roleLabel(user.role)}</Badge>
                  </Td>
                  <Td className="text-muted">{user.jobTitle ?? '—'}</Td>
                  <Td>{user.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Deactivated</Badge>}</Td>
                  <Td className="whitespace-nowrap text-muted">{formatDateTime(user.lastLoginAt)}</Td>
                  {canManage && (
                    <Td>
                      <div className="flex justify-end">
                        <RowMenu label="User actions">
                          {(close) => (
                            <>
                              <DropdownItem onClick={() => { close(); router.push(routes.person(user.id)); }}>
                                <Eye /> View details
                              </DropdownItem>
                              {canEditUser(user) && (
                                <>
                                  <DropdownItem onClick={() => { close(); setEditing(user); }}>
                                    <Pencil /> Edit
                                  </DropdownItem>
                                  <DropdownItem onClick={() => { close(); setResetting(user); }}>
                                    <KeyRound /> Reset password
                                  </DropdownItem>
                                  {canManageCoordinators && user.id !== session?.id && (
                                    <DropdownItem
                                      onClick={() => {
                                        close();
                                        update.mutate({ id: user.id, role: user.role === OrgRole.PROJECT_COORDINATOR ? OrgRole.MEMBER : OrgRole.PROJECT_COORDINATOR });
                                      }}
                                    >
                                      <ArrowUpDown /> {user.role === OrgRole.PROJECT_COORDINATOR ? 'Make member' : 'Make project coordinator'}
                                    </DropdownItem>
                                  )}
                                  {user.isActive && (
                                    <DropdownItem onClick={() => { close(); invite.mutate(user.id); }}>
                                      <Mail /> {user.lastLoginAt ? 'Email password link' : 'Resend invitation'}
                                    </DropdownItem>
                                  )}
                                  {user.id !== session?.id && (
                                    <>
                                      <DropdownSeparator />
                                      <DropdownItem danger={user.isActive} onClick={() => { close(); update.mutate({ id: user.id, isActive: !user.isActive }); }}>
                                        {user.isActive ? <UserX /> : <UserCheck />} {user.isActive ? 'Deactivate' : 'Reactivate'}
                                      </DropdownItem>
                                      {canRemove && (
                                        <DropdownItem danger onClick={() => { close(); setRemoving(user); }}>
                                          <Trash2 /> Remove from organization
                                        </DropdownItem>
                                      )}
                                    </>
                                  )}
                                </>
                              )}
                            </>
                          )}
                        </RowMenu>
                      </div>
                    </Td>
                  )}
                </Tr>
              ))}
            </tbody>
          </Table>
          <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} onPageChange={setPage} />
        </>
      )}
      <UserFormModal
        user={editing}
        onClose={() => setEditing(null)}
        isSelf={editing !== 'new' && editing?.id === session?.id}
        roles={canManageCoordinators ? ORG_ROLES : [OrgRole.MEMBER]}
      />
      <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />
      <RemovePersonDialog
        person={removing}
        candidates={activePeople?.data ?? []}
        loading={remove.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={(transferTo) => removing && remove.mutate({ id: removing.id, transferTo }, { onSuccess: () => setRemoving(null) })}
      />
    </Card>
  );
}

const userSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  firstName: z.string().trim().min(1, 'Required'),
  lastName: z.string().trim().min(1, 'Required'),
  jobTitle: z.string().optional(),
  role: z.enum([OrgRole.PROJECT_COORDINATOR, OrgRole.MEMBER]),
  hourlyRate: z.string().optional(),
  password: z.string().optional(),
});
type UserValues = z.infer<typeof userSchema>;

function UserFormModal({ user, onClose, isSelf, roles }: { user: User | 'new' | null; onClose: () => void; isSelf: boolean; roles: readonly OrgRole[] }) {
  const isNew = user === 'new';
  const existing = user && user !== 'new' ? user : null;
  const create = useCreateUser();
  const update = useUpdateUser();
  const minPasswordLength = usePasswordMinLength();
  const roleLocked = isSelf || roles.length < 2;
  const form = useForm<UserValues>({ resolver: zodResolver(userSchema) });
  const { errors } = form.formState;

  useEffect(() => {
    if (!user) return;
    form.reset({
      email: existing?.email ?? '',
      firstName: existing?.firstName ?? '',
      lastName: existing?.lastName ?? '',
      jobTitle: existing?.jobTitle ?? '',
      role: (existing?.role as OrgRole | undefined) ?? OrgRole.MEMBER,
      hourlyRate: existing?.hourlyRate?.toString() ?? '',
      password: '',
    });
  }, [user, existing, form]);

  const onSubmit = form.handleSubmit((values) => {
    const base = {
      firstName: values.firstName,
      lastName: values.lastName,
      jobTitle: values.jobTitle || null,
      hourlyRate: values.hourlyRate ? Number(values.hourlyRate) : null,
    };
    if (isNew) {
      // Without a password the API emails an invitation link instead.
      const password = values.password || undefined;
      const parsed = password ? passwordSchema(minPasswordLength).safeParse(password) : null;
      if (parsed && !parsed.success) return form.setError('password', { message: parsed.error.issues[0]?.message });
      create.mutate({ ...base, email: values.email, role: values.role, password }, { onSuccess: onClose });
    } else if (existing) {
      update.mutate({ id: existing.id, ...base, ...(roleLocked ? {} : { role: values.role }) }, { onSuccess: onClose });
    }
  });

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      title={isNew ? 'Add user' : 'Edit user'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={create.isPending || update.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" required error={errors.firstName?.message}>
          <Input {...form.register('firstName')} />
        </Field>
        <Field label="Last name" required error={errors.lastName?.message}>
          <Input {...form.register('lastName')} />
        </Field>
        <Field label="Email" required error={errors.email?.message} className="sm:col-span-2">
          <Input type="email" disabled={!isNew} {...form.register('email')} />
        </Field>
        <Field
          label="Role"
          hint={
            isSelf
              ? 'You cannot change your own role'
              : roles.length < 2
                ? 'Only the root account can appoint project coordinators'
                : 'Coordinator: creates projects, adds members and schedules meetings. Member: sees and works on their own projects.'
          }
        >
          <Select disabled={roleLocked} {...form.register('role')}>
            {ORG_ROLES.filter((r) => roles.includes(r) || r === form.watch('role')).map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Hourly rate">
          <Input type="number" min={0} step="0.01" {...form.register('hourlyRate')} />
        </Field>
        <Field label="Job title" className="sm:col-span-2">
          <Input {...form.register('jobTitle')} />
        </Field>
        {isNew && (
          <Field label="Initial password (optional)" error={errors.password?.message} hint="Leave empty to email them an invitation link to choose their own password." className="sm:col-span-2">
            <Input type="password" autoComplete="new-password" {...form.register('password')} />
          </Field>
        )}
      </form>
    </Modal>
  );
}

function ResetPasswordModal({ user, onClose }: { user: User | null; onClose: () => void }) {
  const reset = useResetPassword();
  const minPasswordLength = usePasswordMinLength();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setPassword('');
    setError('');
  }, [user]);

  const submit = () => {
    const parsed = passwordSchema(minPasswordLength).safeParse(password);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Invalid password');
    if (user) reset.mutate({ id: user.id, password }, { onSuccess: onClose });
  };

  return (
    <Modal
      open={!!user}
      onClose={onClose}
      size="sm"
      title="Reset password"
      description={user ? `Set a new password for ${fullName(user)}. They will be signed out of all sessions.` : undefined}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={reset.isPending}>
            Reset password
          </Button>
        </>
      }
    >
      <Field label="New password" error={error}>
        <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
    </Modal>
  );
}

/** Password policy published by the API (the API validates again on submit). */
