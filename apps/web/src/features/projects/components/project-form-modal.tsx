'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { useSession } from '@/features/auth/api';
import { LookupSelect } from '@/features/lookups/components/lookup-select';
import { useActiveUsers } from '@/features/users/api';
import { UserMultiSelect } from '@/features/users/components/user-multi-select';
import { appConfig } from '@/shared/config/env';
import { LookupType, PLATFORM_ROOT_ROLE } from '@/shared/constants/domain';
import { cn, compact, fullName, toInputDate } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Field, Input, Select, Textarea } from '@/shared/ui/form';
import { Modal } from '@/shared/ui/modal';
import { useCreateProject, useMemberCandidates, useUpdateProject } from '../api';
import type { Project, ProjectInput } from '../types';

const schema = z
  .object({
    name: z.string().trim().min(2, 'Name is required').max(120),
    key: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z][A-Z0-9]{1,9}$/, '2-10 letters/digits, starting with a letter'),
    description: z.string().max(5000).optional(),
    color: z.string().optional(),
    statusId: z.string().optional(),
    ownerId: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    budgetHours: z.string().optional(),
    memberIds: z.array(z.string()),
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
    path: ['endDate'],
    message: 'End date must be after the start date',
  });
type Values = z.infer<typeof schema>;

const suggestKey = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()
    .slice(0, 4);

interface Props {
  open: boolean;
  onClose: () => void;
  project?: Project;
  onSaved?: (project: Project) => void;
}

export function ProjectFormModal({ open, onClose, project, onSaved }: Props) {
  const isEdit = !!project;
  const create = useCreateProject();
  const update = useUpdateProject(project?.id ?? '');
  const { data: users } = useActiveUsers(open);
  // Team members may also include root admins, who belong to no organization.
  const { data: candidates } = useMemberCandidates(undefined, open && !isEdit);
  const { data: session } = useSession();
  // The root account is not a member of the organization, so it must assign an owner.
  const ownerRequired = session?.role === PLATFORM_ROOT_ROLE;

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { memberIds: [] } });
  const { errors } = form.formState;
  // Dates, budget and color are optional: folded away when creating, shown when editing or invalid.
  const [showMore, setShowMore] = useState(false);
  const moreVisible = showMore || isEdit || !!errors.endDate;

  useEffect(() => {
    if (!open) return;
    setShowMore(false);
    form.reset({
      name: project?.name ?? '',
      key: project?.key ?? '',
      description: project?.description ?? '',
      color: project?.color ?? appConfig.brandColor,
      statusId: project?.statusId ?? '',
      ownerId: project?.ownerId ?? '',
      startDate: toInputDate(project?.startDate),
      endDate: toInputDate(project?.endDate),
      budgetHours: project?.budgetHours?.toString() ?? '',
      memberIds: [],
    });
  }, [open, project, form]);

  const onSubmit = form.handleSubmit((values) => {
    if (ownerRequired && !values.ownerId) {
      form.setError('ownerId', { message: 'Choose who owns this project' });
      return;
    }
    const payload = {
      ...compact(
        {
          name: values.name,
          key: values.key,
          description: values.description,
          color: values.color,
          statusId: values.statusId,
          ownerId: values.ownerId,
          startDate: values.startDate,
          endDate: values.endDate,
        },
        isEdit ? ['description', 'startDate', 'endDate'] : [],
      ),
      budgetHours: values.budgetHours ? Number(values.budgetHours) : isEdit ? null : undefined,
      ...(isEdit ? {} : { memberIds: values.memberIds }),
    };
    const options = {
      onSuccess: (saved: Project) => {
        onSaved?.(saved);
        onClose();
      },
    };
    if (isEdit) update.mutate(payload, options);
    else create.mutate(payload as ProjectInput, options);
  });

  const pending = create.isPending || update.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? 'Edit project' : 'New project'}
      description={isEdit ? undefined : 'Projects group tasks, milestones, issues and timesheets.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={pending}>
            {isEdit ? 'Save changes' : 'Create project'}
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-6">
        <Field label="Project name" required error={errors.name?.message} className="sm:col-span-4">
          <Input
            autoFocus
            {...form.register('name', {
              onChange: (event) => {
                if (!isEdit && !form.getFieldState('key').isDirty) form.setValue('key', suggestKey(event.target.value));
              },
            })}
          />
        </Field>
        <Field label="Short code" required error={errors.key?.message} hint="Starts every task number, e.g. WEB-12" className="sm:col-span-2">
          <Input className="uppercase" {...form.register('key')} />
        </Field>
        <Field label="Description" className="sm:col-span-6">
          <Textarea rows={3} {...form.register('description')} />
        </Field>
        <Field label="Status" className="sm:col-span-2">
          <LookupSelect type={LookupType.PROJECT_STATUS} emptyLabel={isEdit ? undefined : 'Default'} {...form.register('statusId')} />
        </Field>
        <Field label="Owner" required={ownerRequired} error={form.formState.errors.ownerId?.message} className="sm:col-span-4">
          <Select {...form.register('ownerId')}>
            {!isEdit && <option value="">{ownerRequired ? 'Select owner' : 'Me'}</option>}
            {users?.data.map((user) => (
              <option key={user.id} value={user.id}>
                {fullName(user)}
              </option>
            ))}
          </Select>
        </Field>
        {!isEdit && (
          <button
            type="button"
            onClick={() => setShowMore((value) => !value)}
            aria-expanded={moreVisible}
            className="inline-flex items-center gap-1.5 justify-self-start text-xs font-medium text-muted hover:text-foreground sm:col-span-6"
          >
            <ChevronDown className={cn('size-3.5 transition-transform', !moreVisible && '-rotate-90')} />
            {moreVisible ? 'Hide' : 'Add'} dates, budget and color
          </button>
        )}
        {moreVisible && (
          <>
            <Field label="Start date" className="sm:col-span-2">
              <Input type="date" {...form.register('startDate')} />
            </Field>
            <Field label="End date" error={errors.endDate?.message} className="sm:col-span-2">
              <Input type="date" {...form.register('endDate')} />
            </Field>
            <Field label="Budget (hours)" className="sm:col-span-1">
              <Input type="number" min={0} step="0.5" {...form.register('budgetHours')} />
            </Field>
            <Field label="Color" className="sm:col-span-1">
              <Input type="color" className="p-1" {...form.register('color')} />
            </Field>
          </>
        )}
        {!isEdit && (
          <Field label="Team members" className="sm:col-span-6" hint="You and the owner are added as project managers automatically.">
            <Controller
              control={form.control}
              name="memberIds"
              render={({ field }) => <UserMultiSelect options={candidates ?? users?.data ?? []} value={field.value} onChange={field.onChange} />}
            />
          </Field>
        )}
      </form>
    </Modal>
  );
}
