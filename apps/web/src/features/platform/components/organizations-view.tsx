'use client';

import { Building2, LogIn, Mail, MoreHorizontal, Pause, Play, Plus, Search, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { appConfig } from '@/shared/config/env';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useQueryParam } from '@/shared/hooks/use-query-param';
import { errorMessage } from '@/shared/lib/api-client';
import { formatDate, formatDateTime, fullName } from '@/shared/lib/utils';
import { Avatar } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Disclosure } from '@/shared/ui/collapsible';
import { EmptyState, ErrorState, Spinner } from '@/shared/ui/feedback';
import { Dropdown, DropdownItem, DropdownSeparator } from '@/shared/ui/dropdown';
import { Field, FormAlert, Input } from '@/shared/ui/form';
import { PageHeader, Pagination, Segmented, Toolbar } from '@/shared/ui/layout';
import { ConfirmDialog, Drawer, Modal } from '@/shared/ui/modal';
import { Table, Td, Th, Tr } from '@/shared/ui/table';
import {
  useAddCoordinator,
  useSendCoordinatorInvite,
  useCreateOrganization,
  useDeletePlatformOrganization,
  useEnterWorkspace,
  usePlatformOrganization,
  usePlatformOrganizations,
  useUpdatePlatformOrganization,
} from '../api';
import type { PlatformOrganizationDetail } from '../types';

type StatusFilter = 'all' | 'active' | 'suspended';

export function OrganizationsView() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [orgId, setOrgId] = useQueryParam('org');
  const debounced = useDebounce(search);

  useEffect(() => setPage(1), [debounced, status]);

  const { data, isLoading, isError, error, refetch } = usePlatformOrganizations({
    search: debounced || undefined,
    status: status === 'all' ? undefined : status,
    page,
    limit: appConfig.defaultPageSize,
  });

  return (
    <>
      <PageHeader
        title="Organizations"
        description="Every organization on the platform and its project coordinators."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> New organization
          </Button>
        }
      />
      <Toolbar>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Search name or slug" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Segmented<StatusFilter>
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'suspended', label: 'Suspended' },
          ]}
        />
      </Toolbar>

      <Card>
        {isLoading ? (
          <Spinner />
        ) : isError ? (
          <ErrorState message={errorMessage(error)} onRetry={refetch} />
        ) : !data?.data.length ? (
          <EmptyState icon={<Building2 />} title="No organizations found" />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Organization</Th>
                  <Th className="text-right">Users</Th>
                  <Th className="text-right">Projects</Th>
                  <Th>Status</Th>
                  <Th>Created</Th>
                  <Th className="w-32" />
                </tr>
              </thead>
              <tbody>
                {data.data.map((org) => (
                    <Tr key={org.id} className="cursor-pointer" onClick={() => setOrgId(org.id)}>
                      <Td>
                        <p className="font-medium text-foreground">{org.name}</p>
                        <p className="font-mono text-xs text-muted">{org.slug}</p>
                      </Td>
                      <Td className="text-right tabular-nums">{org._count.users}</Td>
                      <Td className="text-right tabular-nums">{org._count.projects}</Td>
                      <Td>{org.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Suspended</Badge>}</Td>
                      <Td className="whitespace-nowrap text-muted">{formatDate(org.createdAt)}</Td>
                      <Td onClick={(event) => event.stopPropagation()}>
                        <div className="flex justify-end">
                          <OpenWorkspaceButton organizationId={org.id} size="sm" variant="ghost" />
                        </div>
                      </Td>
                    </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.meta.page} totalPages={data.meta.totalPages} total={data.meta.total} limit={data.meta.limit} itemLabel="organizations" onPageChange={setPage} />
          </>
        )}
      </Card>

      <CreateOrganizationModal open={creating} onClose={() => setCreating(false)} onCreated={setOrgId} />
      <OrganizationDrawer organizationId={orgId} onClose={() => setOrgId(null)} />
    </>
  );
}

// ─── Details drawer ─────────────────────────────────────────────

function OrganizationDrawer({ organizationId, onClose }: { organizationId: string | null; onClose: () => void }) {
  const { data: org, isLoading, isError, error } = usePlatformOrganization(organizationId);
  return (
    <Drawer open={!!organizationId} onClose={onClose} title={org?.name ?? 'Organization'} description={org && <span className="font-mono">{org.slug}</span>}>
      {isLoading ? <Spinner /> : isError || !org ? <ErrorState message={errorMessage(error, 'Organization not found')} /> : <OrganizationDetails key={org.id} org={org} onDeleted={onClose} />}
    </Drawer>
  );
}

function OrganizationDetails({ org, onDeleted }: { org: PlatformOrganizationDetail; onDeleted: () => void }) {
  const update = useUpdatePlatformOrganization();
  const remove = useDeletePlatformOrganization();
  const invite = useSendCoordinatorInvite();
  const [name, setName] = useState(org.name);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<'suspend' | 'delete' | null>(null);
  const [slugConfirm, setSlugConfirm] = useState('');

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-3 rounded-ui-lg border border-brand/30 bg-brand-soft/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Manage this workspace</p>
          <p className="text-xs text-muted">Open the organization with coordinator rights: people, projects, meetings and reports.</p>
        </div>
        <OpenWorkspaceButton organizationId={org.id} />
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Project coordinators</h3>
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <UserPlus /> Add coordinator
          </Button>
        </div>
        {org.coordinators.length ? (
          <ul className="divide-y divide-border rounded-ui-lg border border-border">
            {org.coordinators.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-3 py-2.5">
                <Avatar user={u} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{fullName(u)}</span>
                  <span className="block truncate text-xs text-muted">{u.email}</span>
                </span>
                {!u.isActive && <Badge tone="danger">Inactive</Badge>}
                <span className="hidden text-xs text-muted sm:block">Last sign-in {formatDateTime(u.lastLoginAt)}</span>
                {u.isActive && (
                  <Button
                    size="sm"
                    variant="ghost"
                    title={u.lastLoginAt ? 'Email a link to set a new password' : 'Resend invitation email'}
                    aria-label={u.lastLoginAt ? 'Email password link' : 'Resend invitation'}
                    loading={invite.isPending && invite.variables?.userId === u.id}
                    onClick={() => invite.mutate({ organizationId: org.id, userId: u.id })}
                  >
                    <Mail />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-ui-lg border border-dashed border-border p-4 text-sm text-muted">No coordinator yet. Add one so someone can run this organization.</p>
        )}
        <p className="mt-2 text-xs text-muted">To promote an existing member, open the workspace and change their role under Settings → Users.</p>
      </section>

      <Disclosure label="Rename organization">
        <section className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Organization name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button variant="secondary" disabled={!name.trim() || name === org.name} loading={update.isPending} onClick={() => update.mutate({ id: org.id, name: name.trim() })}>
            Rename
          </Button>
        </section>
      </Disclosure>

      <section className="flex items-center justify-between gap-2 border-t border-border pt-4">
        <p className="text-xs text-muted">Created {formatDate(org.createdAt)} · {org._count.users} people · {org._count.projects} projects</p>
        <Dropdown
          trigger={({ toggle }) => (
            <Button variant="ghost" size="icon" aria-label="More actions" onClick={toggle}>
              <MoreHorizontal />
            </Button>
          )}
        >
          {(close) => (
            <>
              {org.isActive ? (
                <DropdownItem onClick={() => { close(); setConfirm('suspend'); }}>
                  <Pause /> Suspend organization
                </DropdownItem>
              ) : (
                <DropdownItem onClick={() => { close(); update.mutate({ id: org.id, isActive: true }); }}>
                  <Play /> Reactivate organization
                </DropdownItem>
              )}
              <DropdownSeparator />
              <DropdownItem danger onClick={() => { close(); setConfirm('delete'); }}>
                <Trash2 /> Delete organization
              </DropdownItem>
            </>
          )}
        </Dropdown>
      </section>

      <PersonModal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add project coordinator"
        description={`Creates a coordinator account in ${org.name}.`}
        organizationId={org.id}
      />
      <ConfirmDialog
        open={confirm === 'suspend'}
        onClose={() => setConfirm(null)}
        title="Suspend organization"
        message={`Everyone in ${org.name} will be signed out immediately and unable to sign in until the organization is reactivated. No data is deleted.`}
        confirmLabel="Suspend"
        loading={update.isPending}
        onConfirm={() => update.mutate({ id: org.id, isActive: false }, { onSuccess: () => setConfirm(null) })}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        title="Delete organization"
        message={`This permanently deletes ${org.name} with all of its users, projects, tasks, issues, meetings and timesheets.`}
        confirmLabel="Delete forever"
        loading={remove.isPending}
        onConfirm={() => slugConfirm === org.slug && remove.mutate(org.id, { onSuccess: onDeleted })}
      >
        <Field label={`Type ${org.slug} to confirm`}>
          <Input className="font-mono" value={slugConfirm} onChange={(e) => setSlugConfirm(e.target.value.trim())} />
        </Field>
      </ConfirmDialog>
    </div>
  );
}

function OpenWorkspaceButton({ organizationId, size = 'md', variant = 'primary' }: { organizationId: string; size?: 'sm' | 'md'; variant?: 'primary' | 'secondary' | 'ghost' }) {
  const enter = useEnterWorkspace();
  return (
    <Button size={size} variant={variant} loading={enter.isPending} onClick={() => enter.mutate(organizationId)}>
      {!enter.isPending && <LogIn />} Open workspace
    </Button>
  );
}

// ─── Create ─────────────────────────────────────────────────────

const EMPTY_FORM = { name: '', firstName: '', lastName: '', email: '', password: '' };

function CreateOrganizationModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const create = useCreateOrganization();
  const [values, setValues] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setValues(EMPTY_FORM);
      setError('');
    }
  }, [open]);

  const set = (key: keyof typeof EMPTY_FORM) => (event: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: event.target.value }));

  const submit = () => {
    if ([values.name, values.firstName, values.lastName, values.email].some((v) => !v.trim())) return setError('Name and coordinator details are required');
    create.mutate(
      {
        name: values.name.trim(),
        coordinator: { firstName: values.firstName.trim(), lastName: values.lastName.trim(), email: values.email.trim(), password: values.password || undefined },
      },
      {
        onSuccess: (org) => {
          onClose();
          onCreated(org.id);
        },
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New organization"
      description="Creates the workspace with its default workflow and its first project coordinator."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending}>
            Create organization
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {error && (
          <div className="sm:col-span-2">
            <FormAlert>{error}</FormAlert>
          </div>
        )}
        <Field label="Organization name" required className="sm:col-span-2">
          <Input autoFocus value={values.name} onChange={set('name')} />
        </Field>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted sm:col-span-2">Project coordinator</p>
        <Field label="First name" required>
          <Input value={values.firstName} onChange={set('firstName')} />
        </Field>
        <Field label="Last name" required>
          <Input value={values.lastName} onChange={set('lastName')} />
        </Field>
        <Field label="Email" required className="sm:col-span-2">
          <Input type="email" value={values.email} onChange={set('email')} />
        </Field>
        <Field label="Initial password (optional)" hint="Leave empty to email them an invitation link to choose their own password." className="sm:col-span-2">
          <Input type="password" autoComplete="new-password" value={values.password} onChange={set('password')} />
        </Field>
      </div>
    </Modal>
  );
}

// ─── Add coordinator ────────────────────────────────────────────

const EMPTY_PERSON = { firstName: '', lastName: '', email: '', password: '' };

function PersonModal({ open, onClose, title, description, organizationId }: { open: boolean; onClose: () => void; title: string; description: string; organizationId: string }) {
  const add = useAddCoordinator();
  const [values, setValues] = useState(EMPTY_PERSON);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setValues(EMPTY_PERSON);
      setError('');
    }
  }, [open]);

  const set = (key: keyof typeof EMPTY_PERSON) => (event: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: event.target.value }));
  const submit = () => {
    if ([values.firstName, values.lastName, values.email].some((v) => !v.trim())) return setError('Name and email are required');
    add.mutate(
      { organizationId, firstName: values.firstName.trim(), lastName: values.lastName.trim(), email: values.email.trim(), password: values.password || undefined },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={add.isPending}>
            Add coordinator
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {error && (
          <div className="sm:col-span-2">
            <FormAlert>{error}</FormAlert>
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
        <Field label="Initial password (optional)" hint="Leave empty to email them an invitation link to choose their own password." className="sm:col-span-2">
          <Input type="password" autoComplete="new-password" value={values.password} onChange={set('password')} />
        </Field>
      </div>
    </Modal>
  );
}
