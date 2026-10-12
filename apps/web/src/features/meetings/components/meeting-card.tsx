'use client';

import { CalendarClock, Copy, ExternalLink, FolderKanban, Globe, Pencil, Trash2, Video } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { OrgRole, Permission } from '@/shared/constants/domain';
import { fullName } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog, Modal } from '@/shared/ui/modal';
import { useDeleteMeeting } from '../api';
import { formatMeetingRange, formatTime, meetingStyle } from '../meeting-types';
import type { Meeting } from '../types';
import { MeetingFormModal } from './meeting-form-modal';

/** Compact chip shown inside a calendar day. */
export function MeetingChip({ meeting, onOpen, roomy }: { meeting: Meeting; onOpen: () => void; roomy?: boolean }) {
  const style = meetingStyle(meeting.type);
  return (
    <div className="flex w-full overflow-hidden rounded-md text-xs font-medium text-white shadow-ui-sm" style={{ backgroundColor: style.color }}>
      <button
        type="button"
        onClick={onOpen}
        title={`${formatTime(meeting.startsAt)} ${meeting.title} · ${style.label}`}
        className={`flex min-w-0 flex-1 items-center gap-1.5 text-left transition hover:brightness-110 ${roomy ? 'px-2 py-1.5' : 'px-1.5 py-1'}`}
      >
        <Video className="size-3 shrink-0" aria-hidden />
        <span className="shrink-0 tabular-nums opacity-90">{formatTime(meeting.startsAt)}</span>
        <span className="min-w-0 truncate">{meeting.title}</span>
      </button>
      {/* Straight to the call, without opening the details first. */}
      <a
        href={meetingHref(meeting.link)}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Join ${meeting.title}`}
        title="Join meeting"
        className={`flex shrink-0 items-center border-l border-white/25 transition hover:bg-black/15 ${roomy ? 'px-2' : 'px-1'}`}
      >
        <ExternalLink className="size-3" aria-hidden />
      </a>
    </div>
  );
}

/** Opens links saved without a scheme (e.g. "meet.google.com/abc") instead of treating them as app paths. */
export function meetingHref(link: string): string {
  return /^[a-z][a-z0-9+.-]*:/i.test(link) ? link : `https://${link.replace(/^\/+/, '')}`;
}

/** Pop-up card with everything about a meeting and a button to join it. */
export function MeetingDetailModal({ meeting, onClose }: { meeting: Meeting | null; onClose: () => void }) {
  const { can, user } = usePermissions();
  const viewer = user?.role === OrgRole.VIEWER;
  const remove = useDeleteMeeting();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  if (!meeting) return null;
  const style = meetingStyle(meeting.type);
  // Clients change only the client meetings they scheduled themselves.
  const canManage = can(Permission.MEETINGS_MANAGE) || (viewer && meeting.createdBy.id === user?.id);

  return (
    <>
      <Modal
        open={!!meeting && !editing && !deleting}
        onClose={onClose}
        size="sm"
        title={
          <span className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: style.color }} />
            {meeting.title}
          </span>
        }
        description={style.label}
        footer={
          <>
            {canManage && (
              <div className="mr-auto flex gap-1">
                <Button variant="ghost" size="icon" aria-label="Edit meeting" onClick={() => setEditing(true)}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon" aria-label="Delete meeting" onClick={() => setDeleting(true)}>
                  <Trash2 className="text-danger" />
                </Button>
              </div>
            )}
            <a
              href={meetingHref(meeting.link)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-[var(--control-h)] items-center gap-2 rounded-ui bg-brand px-3.5 text-sm font-medium text-brand-foreground shadow-ui-sm transition-colors hover:bg-[color-mix(in_srgb,var(--brand)_88%,black)] [&_svg]:size-4"
            >
              <ExternalLink /> Join meeting
            </a>
          </>
        }
      >
        <dl className="space-y-3 text-sm">
          <Row icon={<CalendarClock />}>{formatMeetingRange(meeting)}</Row>
          <Row icon={meeting.project ? <FolderKanban /> : <Globe />}>
            {meeting.project ? (viewer ? meeting.project.name : `Members of ${meeting.project.name}`) : viewer ? 'Organization-wide' : 'Everyone in the organization'}
          </Row>
          <Row icon={<Video />}>
            <span className="flex min-w-0 items-center gap-1">
              <a href={meetingHref(meeting.link)} target="_blank" rel="noopener noreferrer" className="truncate text-brand hover:underline">
                {meeting.link}
              </a>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Copy link"
                onClick={() => {
                  void navigator.clipboard?.writeText(meeting.link);
                  toast.success('Link copied');
                }}
              >
                <Copy className="size-3.5" />
              </Button>
            </span>
          </Row>
          {meeting.description && <p className="whitespace-pre-wrap rounded-ui bg-surface-muted p-3 text-foreground-soft">{meeting.description}</p>}
          <p className="text-xs text-muted">Scheduled by {fullName(meeting.createdBy)}</p>
        </dl>
      </Modal>
      <MeetingFormModal open={editing} meeting={meeting} onClose={() => setEditing(false)} clientOnly={viewer} />
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete meeting"
        message={`Remove "${meeting.title}" from everyone's calendar?`}
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => remove.mutate(meeting.id, { onSuccess: () => { setDeleting(false); onClose(); } })}
      />
    </>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-muted [&_svg]:size-4">{icon}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Colour key for the meeting kinds. */
export function MeetingLegend({ clientOnly = false }: { clientOnly?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
      {(clientOnly ? (['CLIENT'] as const) : (['INTERNAL', 'CLIENT'] as const)).map((type) => (
        <span key={type} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ backgroundColor: meetingStyle(type).color }} />
          {meetingStyle(type).label}
        </span>
      ))}
    </div>
  );
}
