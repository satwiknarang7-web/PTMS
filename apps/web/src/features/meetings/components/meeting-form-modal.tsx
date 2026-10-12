'use client';

import { useEffect, useState } from 'react';
import { useProjectNavigation } from '@/features/projects/api';
import { MeetingType } from '@/shared/constants/domain';
import { Button } from '@/shared/ui/button';
import { Field, FormAlert, Input, Select, Textarea } from '@/shared/ui/form';
import { Modal } from '@/shared/ui/modal';
import { cn } from '@/shared/lib/utils';
import { useCreateMeeting, useUpdateMeeting } from '../api';
import { MEETING_TYPE_STYLES } from '../meeting-types';
import type { Meeting } from '../types';

interface MeetingFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Meeting being edited; omit to schedule a new one. */
  meeting?: Meeting | null;
  /** Day (YYYY-MM-DD) to pre-fill for a new meeting. */
  defaultDay?: string;
  /** Project to pre-select for a new meeting (null = whole organization). */
  defaultProjectId?: string | null;
  /** Clients: a client meeting about one of their projects (kind and audience fixed). */
  clientOnly?: boolean;
}

const DEFAULT_START = '10:00';
const DEFAULT_MINUTES = 30;

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function emptyValues(day: string | undefined, projectId: string | null | undefined) {
  const [h, m] = DEFAULT_START.split(':').map(Number);
  const end = new Date(2000, 0, 1, h, m + DEFAULT_MINUTES);
  return {
    title: '',
    description: '',
    type: MeetingType.INTERNAL as MeetingType,
    link: '',
    day: day ?? localDate(new Date()),
    start: DEFAULT_START,
    end: localTime(end),
    projectId: projectId ?? '',
  };
}

/** Schedule or edit a meeting: link, time, kind and who sees it (a project or everyone). */
export function MeetingFormModal({
  open,
  onClose,
  meeting,
  defaultDay,
  defaultProjectId,
  clientOnly = false,
}: MeetingFormModalProps) {
  const create = useCreateMeeting();
  const update = useUpdateMeeting();
  const { data: projects } = useProjectNavigation(open);
  const [values, setValues] = useState(() => emptyValues(defaultDay, defaultProjectId));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (meeting) {
      const start = new Date(meeting.startsAt);
      setValues({
        title: meeting.title,
        description: meeting.description ?? '',
        type: meeting.type,
        link: meeting.link,
        day: localDate(start),
        start: localTime(start),
        end: localTime(new Date(meeting.endsAt)),
        projectId: meeting.projectId ?? '',
      });
    } else {
      const values = emptyValues(defaultDay, defaultProjectId);
      setValues(
        clientOnly
          ? { ...values, type: MeetingType.CLIENT, projectId: values.projectId || projects?.[0]?.id || '' }
          : values,
      );
    }
    // `projects` only seeds the client's default project; reloading it must not reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, meeting, defaultDay, defaultProjectId, clientOnly]);

  const set = (key: keyof typeof values) => (event: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: event.target.value }));

  const submit = () => {
    if (!values.title.trim()) return setError('Give the meeting a title');
    if (!/^https?:\/\/\S+$/i.test(values.link.trim()))
      return setError('Paste the full meeting link, starting with https://');
    const startsAt = new Date(`${values.day}T${values.start}`);
    const endsAt = new Date(`${values.day}T${values.end}`);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return setError('Pick a date and times');
    if (endsAt <= startsAt) return setError('The meeting must end after it starts');
    if (clientOnly && !values.projectId) return setError('Choose the project the meeting is about');
    const input = {
      title: values.title.trim(),
      description: values.description.trim() || null,
      type: clientOnly ? MeetingType.CLIENT : values.type,
      link: values.link.trim(),
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      projectId: values.projectId || null,
    };
    if (meeting) update.mutate({ id: meeting.id, ...input }, { onSuccess: onClose });
    else create.mutate(input, { onSuccess: onClose });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={meeting ? 'Edit meeting' : 'Schedule a meeting'}
      description="Everyone who can see it gets a notification on the morning of the meeting."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending || update.isPending}>
            {meeting ? 'Save' : 'Schedule'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {error && (
          <div className="sm:col-span-3">
            <FormAlert>{error}</FormAlert>
          </div>
        )}
        <Field label="Title" required className="sm:col-span-3">
          <Input autoFocus value={values.title} onChange={set('title')} placeholder="e.g. Weekly sync" />
        </Field>
        {!clientOnly && (
          <div className="sm:col-span-3">
            <p className="mb-1.5 text-sm font-medium text-foreground">Kind</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup">
              {Object.values(MeetingType).map((type) => {
                const style = MEETING_TYPE_STYLES[type];
                const active = values.type === type;
                return (
                  <button
                    key={type}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setValues((v) => ({ ...v, type }))}
                    className={cn(
                      'flex items-center gap-2 rounded-ui border px-3 py-2 text-sm transition-colors',
                      active ? 'border-transparent ring-2' : 'border-border hover:bg-surface-muted',
                    )}
                    style={
                      active
                        ? { boxShadow: `0 0 0 2px ${style.color}`, backgroundColor: `${style.color}14` }
                        : undefined
                    }
                  >
                    <span className="size-2.5 rounded-full" style={{ backgroundColor: style.color }} />
                    {style.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <Field
          label="Meeting link"
          required
          hint="Zoom, Teams, Google Meet… everyone who can see the meeting can open it."
          className="sm:col-span-3"
        >
          <Input type="url" value={values.link} onChange={set('link')} placeholder="https://" />
        </Field>
        <Field label="Date" required>
          <Input type="date" value={values.day} onChange={set('day')} />
        </Field>
        <Field label="Starts" required>
          <Input type="time" value={values.start} onChange={set('start')} />
        </Field>
        <Field label="Ends" required>
          <Input type="time" value={values.end} onChange={set('end')} />
        </Field>
        <Field label={clientOnly ? 'Project' : 'Visible to'} required={clientOnly} className="sm:col-span-3">
          <Select value={values.projectId} onChange={set('projectId')}>
            {clientOnly ? (
              <option value="">Choose a project…</option>
            ) : (
              <option value="">Everyone in the organization</option>
            )}
            {projects?.map((project) => (
              <option key={project.id} value={project.id}>
                {clientOnly ? project.name : `Members of ${project.name}`}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes" className="sm:col-span-3">
          <Textarea
            rows={2}
            value={values.description}
            onChange={set('description')}
            placeholder="Agenda, dial-in details…"
          />
        </Field>
      </div>
    </Modal>
  );
}
