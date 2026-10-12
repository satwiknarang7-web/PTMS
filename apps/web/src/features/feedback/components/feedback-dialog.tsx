'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Field, Textarea } from '@/shared/ui/form';
import { Modal } from '@/shared/ui/modal';
import { useSendFeedback } from '../api';

/** Anyone can tell the team how the app could be better; only root admins read it. */
export function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const send = useSendFeedback();
  const pathname = usePathname();
  const [body, setBody] = useState('');

  useEffect(() => {
    if (open) setBody('');
  }, [open]);

  const submit = () => {
    if (body.trim().length < 3) return;
    send.mutate({ body: body.trim(), page: pathname }, { onSuccess: onClose });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Send feedback"
      description="What could work better? Ideas, problems, anything. Only the platform administrators can read it."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={send.isPending} disabled={body.trim().length < 3}>
            Send feedback
          </Button>
        </>
      }
    >
      <Field label="Your feedback" htmlFor="feedback-body">
        <Textarea
          id="feedback-body"
          autoFocus
          rows={6}
          maxLength={5000}
          placeholder="e.g. It would help if the Kanban board showed due dates…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit();
          }}
        />
      </Field>
    </Modal>
  );
}
