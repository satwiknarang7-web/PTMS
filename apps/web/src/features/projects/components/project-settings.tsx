'use client';

import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Trash2, UserPlus, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { UserMultiSelect } from '@/features/users/components/user-multi-select';
import { routes } from '@/shared/config/routes';
import { formatDate, fullName } from '@/shared/lib/utils';
import { Avatar } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { CardBody } from '@/shared/ui/card';
import { CollapsibleCard } from '@/shared/ui/collapsible';
import { Dropdown, DropdownItem, DropdownSeparator } from '@/shared/ui/dropdown';
import { Spinner } from '@/shared/ui/feedback';
import { Field, Input } from '@/shared/ui/form';
import { ConfirmDialog, Modal } from '@/shared/ui/modal';
import { useAddMembers, useDeleteProject, useMemberCandidates, useProject, useProjectMembers, useRemoveMember, useUpdateProject } from '../api';
import { ProjectFormModal } from './project-form-modal';

export function ProjectSettings({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { data: project } = useProject(projectId);
  const { data: members, isLoading } = useProjectMembers(projectId);
  const updateProject = useUpdateProject(projectId);
  const deleteProject = useDeleteProject();
  const removeMember = useRemoveMember(projectId);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmKey, setConfirmKey] = useState('');

  if (!project) return <Spinner />;

  return (
    <div className="space-y-4">
      <CollapsibleCard
        title="Project details"
        storageKey="project-settings.details"
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" /> Edit
            </Button>
            <Dropdown
              trigger={({ toggle }) => (
                <Button variant="ghost" size="icon" aria-label="More project actions" onClick={toggle}>
                  <MoreHorizontal />
                </Button>
              )}
            >
              {(close) => (
                <>
                  <DropdownItem
                    onClick={() => {
                      close();
                      updateProject.mutate({ isArchived: !project.isArchived });
                    }}
                  >
                    {project.isArchived ? <ArchiveRestore /> : <Archive />}
                    {project.isArchived ? 'Restore project' : 'Archive project'}
                  </DropdownItem>
                  <DropdownSeparator />
                  <DropdownItem
                    danger
                    onClick={() => {
                      close();
                      setDeleting(true);
                    }}
                  >
                    <Trash2 /> Delete project
                  </DropdownItem>
                </>
              )}
            </Dropdown>
          </>
        }
      >
        <CardBody>
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <Detail label="Key" value={project.key} />
            <Detail label="Owner" value={fullName(project.owner)} />
            <Detail label="Budget" value={project.budgetHours ? `${project.budgetHours} hours` : '—'} />
            <Detail label="Start" value={formatDate(project.startDate)} />
            <Detail label="End" value={formatDate(project.endDate)} />
            <Detail label="Created" value={formatDate(project.createdAt)} />
            {project.description && (
              <div className="sm:col-span-3">
                <Detail label="Description" value={project.description} />
              </div>
            )}
          </dl>
        </CardBody>
      </CollapsibleCard>

      <CollapsibleCard
        title="Members"
        meta={members ? `${members.length}` : undefined}
        description="Members see this project and work on its items. Coordinators manage it."
        storageKey="project-settings.members"
        actions={
          <Button size="sm" onClick={() => setAdding(true)}>
            <UserPlus className="size-3.5" /> Add members
          </Button>
        }
      >
        {isLoading ? (
          <Spinner />
        ) : (
          <ul className="grid sm:grid-cols-2">
            {members?.map((member) => {
              const isOwner = member.userId === project.ownerId;
              return (
                <li key={member.id} className="group flex items-center gap-3 border-b border-border px-[var(--card-p)] py-2.5 sm:odd:border-r">
                  <Avatar user={member.user} />
                  <Link href={routes.person(member.userId)} className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-medium hover:underline">
                      {fullName(member.user)} {isOwner && <Badge tone="brand">Owner</Badge>}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {member.user.jobTitle ?? member.user.email} · joined {formatDate(member.createdAt)}
                    </p>
                  </Link>
                  {!isOwner && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${fullName(member.user)}`}
                      className="opacity-60 group-hover:opacity-100"
                      onClick={() => removeMember.mutate(member.userId)}
                    >
                      <X className="size-4 text-danger" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CollapsibleCard>

      <ProjectFormModal open={editing} onClose={() => setEditing(false)} project={project} />
      <AddMembersModal projectId={projectId} open={adding} onClose={() => setAdding(false)} existingIds={members?.map((m) => m.userId) ?? []} />
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete project"
        message={`This permanently deletes ${project.name} with all of its tasks, issues, milestones and time entries.`}
        confirmLabel="Delete forever"
        loading={deleteProject.isPending}
        onConfirm={() =>
          confirmKey === project.key &&
          deleteProject.mutate(project.id, { onSuccess: () => router.replace(routes.projects) })
        }
      >
        <Field label={`Type ${project.key} to confirm`}>
          <Input value={confirmKey} onChange={(e) => setConfirmKey(e.target.value.toUpperCase())} />
        </Field>
      </ConfirmDialog>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap">{value}</dd>
    </div>
  );
}

function AddMembersModal({ projectId, open, onClose, existingIds }: { projectId: string; open: boolean; onClose: () => void; existingIds: string[] }) {
  // Organization members and root admins who are not on the project yet.
  const { data: users } = useMemberCandidates(projectId, open);
  const addMembers = useAddMembers(projectId);
  const [selected, setSelected] = useState<string[]>([]);
  const candidates = useMemo(() => (users ?? []).filter((u) => !existingIds.includes(u.id)), [users, existingIds]);

  const close = () => {
    setSelected([]);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add members"
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button disabled={!selected.length} loading={addMembers.isPending} onClick={() => addMembers.mutate({ userIds: selected }, { onSuccess: close })}>
            Add {selected.length || ''}
          </Button>
        </>
      }
    >
      <Field label="People" hint="They will see this project and can work on its items.">
        <UserMultiSelect options={candidates} value={selected} onChange={setSelected} placeholder="Choose people to add" />
      </Field>
    </Modal>
  );
}
