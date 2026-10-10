'use client';

import { useEffect, useState } from 'react';
import { fullName } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Field, FormAlert, Input, Select } from '@/shared/ui/form';
import { Modal } from '@/shared/ui/modal';

interface Person {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface RemovePersonDialogProps {
  person: Person | null;
  /** Active people who can take over the removed person's work (the person themselves is filtered out). */
  candidates: Person[];
  loading?: boolean;
  onClose: () => void;
  onConfirm: (transferTo: string | undefined) => void;
}

/** Confirms permanently removing someone and picks who takes over their projects and records. */
export function RemovePersonDialog({ person, candidates, loading, onClose, onConfirm }: RemovePersonDialogProps) {
  const heirs = candidates.filter((c) => c.id !== person?.id);
  const [transferTo, setTransferTo] = useState('');
  const [typed, setTyped] = useState('');

  useEffect(() => {
    setTransferTo('');
    setTyped('');
  }, [person?.id]);

  const confirmed = !!person && typed.trim().toLowerCase() === person.email.toLowerCase();

  return (
    <Modal
      open={!!person}
      onClose={onClose}
      title={person ? `Remove ${fullName(person)}?` : 'Remove person'}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" loading={loading} disabled={!confirmed} onClick={() => onConfirm(transferTo || undefined)}>
            Remove permanently
          </Button>
        </>
      }
    >
      {person && (
        <div className="space-y-4">
          <FormAlert>
            Their account, comments, time entries and notifications are deleted. This cannot be undone. To keep their history, deactivate the account instead.
          </FormAlert>
          <Field label="Hand their projects, tasks, issues and meetings over to" hint="Leave as automatic to use the organization's first project coordinator.">
            <Select value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
              <option value="">Automatic</option>
              {heirs.map((c) => (
                <option key={c.id} value={c.id}>
                  {fullName(c)} · {c.email}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={<>Type <span className="font-mono text-foreground">{person.email}</span> to confirm</>}>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </Field>
        </div>
      )}
    </Modal>
  );
}
