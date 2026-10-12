'use client';

import { Archive, ArchiveRestore, CheckCircle2, RotateCcw, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useLookups } from '@/features/lookups/api';
import { RowMenu } from '@/shared/components/row-menu';
import { routes } from '@/shared/config/routes';
import { LookupType, StatusCategory } from '@/shared/constants/domain';
import { DropdownItem, DropdownSeparator } from '@/shared/ui/dropdown';
import { Field, Input } from '@/shared/ui/form';
import { ConfirmDialog } from '@/shared/ui/modal';
import { useDeleteProject, useUpdateProject } from '../api';

interface ActionableProject {
  id: string;
  name: string;
  key: string;
  isArchived: boolean;
  status: { id: string; category?: string | null };
}

/**
 * Mark as completed / reopen, archive / restore and delete, for coordinators and root (the API
 * refuses everyone else). `afterDelete` defaults to going back to the project list.
 */
export function ProjectActions({
  project,
  className,
  afterDelete,
}: {
  project: ActionableProject;
  className?: string;
  afterDelete?: () => void;
}) {
  const router = useRouter();
  const { data: statuses } = useLookups(LookupType.PROJECT_STATUS);
  const update = useUpdateProject(project.id);
  const remove = useDeleteProject();
  const [deleting, setDeleting] = useState(false);
  const [confirmKey, setConfirmKey] = useState('');

  const completed = project.status.category === StatusCategory.CLOSED;
  const target = completed
    ? (statuses.find((s) => s.category === StatusCategory.IN_PROGRESS) ??
      statuses.find((s) => s.category !== StatusCategory.CLOSED))
    : statuses.find((s) => s.category === StatusCategory.CLOSED);

  return (
    <>
      <RowMenu label={`Actions for ${project.name}`} className={className}>
        {(close) => (
          <>
            {target && !project.isArchived && (
              <DropdownItem
                onClick={() => {
                  close();
                  update.mutate({ statusId: target.id });
                }}
              >
                {completed ? <RotateCcw /> : <CheckCircle2 className="!text-success" />}
                {completed ? `Reopen (${target.name})` : 'Mark as completed'}
              </DropdownItem>
            )}
            <DropdownItem
              onClick={() => {
                close();
                update.mutate({ isArchived: !project.isArchived });
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
                setConfirmKey('');
                setDeleting(true);
              }}
            >
              <Trash2 /> Delete project
            </DropdownItem>
          </>
        )}
      </RowMenu>
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete project"
        message={`This permanently deletes ${project.name} with all of its tasks, issues, milestones and time entries. To keep its history, archive it instead.`}
        confirmLabel="Delete forever"
        loading={remove.isPending}
        onConfirm={() =>
          confirmKey === project.key &&
          remove.mutate(project.id, {
            onSuccess: () => {
              setDeleting(false);
              if (afterDelete) afterDelete();
              else router.replace(routes.projects);
            },
          })
        }
      >
        <Field label={`Type ${project.key} to confirm`}>
          <Input value={confirmKey} onChange={(e) => setConfirmKey(e.target.value.toUpperCase())} />
        </Field>
      </ConfirmDialog>
    </>
  );
}
