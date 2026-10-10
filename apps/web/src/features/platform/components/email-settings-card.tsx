'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Mail, Send } from 'lucide-react';
import { useState } from 'react';
import { api, errorMessage } from '@/shared/lib/api-client';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardBody, CardHeader } from '@/shared/ui/card';
import { FormAlert, Input } from '@/shared/ui/form';

interface MailSettings {
  configured: boolean;
  host: string | null;
  port: number;
  secure: boolean;
  user: string | null;
  from: string;
  passwordSet: boolean;
}

/** Shows the SMTP settings (never the password) and sends a test email that explains any failure. */
export function EmailSettingsCard() {
  const { data } = useQuery({ queryKey: ['platform', 'mail'], queryFn: () => api.get<MailSettings>('/platform/mail') });
  const [to, setTo] = useState('');
  const test = useMutation({
    mutationFn: () => api.post<void>('/platform/mail/test', to.trim() ? { to: to.trim() } : {}),
    meta: { silentError: true },
  });

  const rows: [string, string][] = data
    ? [
        ['Server', data.host ? `${data.host}:${data.port} (${data.secure ? 'SSL/TLS' : 'STARTTLS'})` : 'Not set'],
        ['Username', data.user ?? 'Not set'],
        ['Password', data.passwordSet ? 'Set' : 'Not set'],
        ['Sender', data.from],
      ]
    : [];

  return (
    <Card>
      <CardHeader
        icon={<Mail />}
        title="Email (SMTP)"
        description="Invitations and password resets are sent with these settings."
        actions={data && (data.configured ? <Badge tone="success">Configured</Badge> : <Badge tone="danger">Not configured</Badge>)}
      />
      <CardBody className="space-y-4">
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="truncate font-medium text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input type="email" placeholder="Send to (defaults to you)" value={to} onChange={(e) => setTo(e.target.value)} className="sm:max-w-xs" />
          <Button variant="secondary" onClick={() => test.mutate()} loading={test.isPending}>
            <Send /> Send test email
          </Button>
        </div>
        {test.isSuccess && <FormAlert tone="success">Test email sent. Check the inbox (and spam folder).</FormAlert>}
        {test.isError && <FormAlert>{errorMessage(test.error)}</FormAlert>}
      </CardBody>
    </Card>
  );
}
