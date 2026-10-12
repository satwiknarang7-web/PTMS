'use client';

import { MoreHorizontal, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { CommentsPanel, CommentThread } from '@/features/comments/components/comment-thread';
import { LookupSelect } from '@/features/lookups/components/lookup-select';
import { useMilestones } from '@/features/milestones/api';
import { useProject, useProjectMembers } from '@/features/projects/api';
import { LookupType } from '@/shared/constants/domain';
import { errorMessage } from '@/shared/lib/api-client';
import { formatDateTime, fullName, toInputDate } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Dropdown, DropdownItem } from '@/shared/ui/dropdown';
import { ErrorState, Spinner } from '@/shared/ui/feedback';
import { Field, Input, Select, Textarea } from '@/shared/ui/form';
import { ConfirmDialog, Drawer } from '@/shared/ui/modal';
import { useDeleteIssue, useIssue, useSaveIssue } from '../api';
import type { Issue, IssueInput } from '../types';
import { issueRef } from './issue-table';

export function IssueDrawer({ issueId, onClose }: { issueId: string | null; onClose: () => void }) {
  const { data: issue, isLoading, isError, error } = useIssue(issueId);
  return (
    <Drawer
      open={!!issueId}
      onClose={onClose}
      title={issue ? issueRef(issue) : 'Issue'}
      description={issue?.project.name}
      aside={issue && <CommentsPanel target={{ issueId: issue.id }} />}
    >
      {isLoading ? <Spinner /> : isError || !issue ? <ErrorState message={errorMessage(error, 'Issue not found')} /> : <IssueBody key={issue.id} issue={issue} onClose={onClose} />}
    </Drawer>
  );
}

function IssueBody({ issue, onClose }: { issue: Issue; onClose: () => void }) {
  const { data: project } = useProject(issue.projectId);
  const { data: members } = useProjectMembers(issue.projectId);
  const { data: milestones } = useMilestones(issue.projectId);
  const save = useSaveIssue();
  const remove = useDeleteIssue();
  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(issue.description ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canEdit = !!project?.access.canEdit && !project.isArchived;

  const patch = (input: Partial<IssueInput>) => save.mutate({ id: issue.id, projectId: issue.projectId, ...input });

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-start gap-2">
          <Input
            aria-label="Title"
            disabled={!canEdit}
            className="h-auto min-w-0 flex-1 border-transparent px-0 text-lg font-semibold shadow-none hover:border-border focus:px-3"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== issue.title && patch({ title: title.trim() })}
          />
          {canEdit && (
            <Dropdown
              trigger={({ open, toggle }) => (
                <Button variant="ghost" size="icon" aria-label="Issue actions" aria-expanded={open} onClick={toggle} className="mt-0.5">
                  <MoreHorizontal />
                </Button>
              )}
            >
              {(close) => (
                <DropdownItem
                  danger
                  onClick={() => {
                    close();
                    setConfirmDelete(true);
                  }}
                >
                  <Trash2 /> Delete issue
                </DropdownItem>
              )}
            </Dropdown>
          )}
        </div>
        <p className="mt-1 text-xs text-muted">
          Reported by {fullName(issue.reporter)} · {formatDateTime(issue.createdAt)}
          {issue.resolvedAt && ` · Resolved ${formatDateTime(issue.resolvedAt)}`}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Status">
          <LookupSelect type={LookupType.ISSUE_STATUS} disabled={!canEdit} value={issue.statusId} onChange={(e) => patch({ statusId: e.target.value })} />
        </Field>
        <Field label="Severity">
          <LookupSelect type={LookupType.ISSUE_SEVERITY} disabled={!canEdit} value={issue.severityId} onChange={(e) => patch({ severityId: e.target.value })} />
        </Field>
        <Field label="Priority">
          <LookupSelect type={LookupType.PRIORITY} disabled={!canEdit} value={issue.priorityId} onChange={(e) => patch({ priorityId: e.target.value })} />
        </Field>
        <Field label="Assignee">
          <Select disabled={!canEdit} value={issue.assigneeId ?? ''} onChange={(e) => patch({ assigneeId: e.target.value || null })}>
            <option value="">Unassigned</option>
            {members?.map((m) => (
              <option key={m.userId} value={m.userId}>
                {fullName(m.user)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Milestone">
          <Select disabled={!canEdit} value={issue.milestoneId ?? ''} onChange={(e) => patch({ milestoneId: e.target.value || null })}>
            <option value="">None</option>
            {milestones?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Due date">
          <Input type="date" disabled={!canEdit} defaultValue={toInputDate(issue.dueDate)} onBlur={(e) => e.target.value !== toInputDate(issue.dueDate) && patch({ dueDate: e.target.value || null })} />
        </Field>
      </div>

      <Field label="Description">
        <Textarea
          rows={6}
          disabled={!canEdit}
          placeholder="Steps to reproduce, expected vs actual behaviour…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== (issue.description ?? '') && patch({ description: description || null })}
        />
      </Field>

      {/* Large screens show the comments in their own panel beside the drawer. */}
      <section className="border-t border-border pt-4 lg:hidden">
        <h3 className="mb-3 text-sm font-semibold">Comments</h3>
        <CommentThread target={{ issueId: issue.id }} />
      </section>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete issue"
        message={`Delete ${issueRef(issue)}? This cannot be undone.`}
        loading={remove.isPending}
        onConfirm={() => remove.mutate(issue.id, { onSuccess: onClose })}
      />
    </div>
  );
}
