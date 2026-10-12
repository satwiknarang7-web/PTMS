'use client';

import { Building2, FolderKanban, ShieldCheck, UserCog, Users } from 'lucide-react';
import Link from 'next/link';
import { routes } from '@/shared/config/routes';
import { errorMessage } from '@/shared/lib/api-client';
import { timeAgo } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { Card, CardBody, CardHeader } from '@/shared/ui/card';
import { ErrorState, Spinner } from '@/shared/ui/feedback';
import { PageHeader } from '@/shared/ui/layout';
import { KpiStrip } from '@/shared/components/kpi-strip';
import { Switch } from '@/shared/ui/switch';
import { usePlatformOverview, usePlatformSettings, useUpdatePlatformSettings } from '../api';

export function PlatformOverview() {
  const { data, isLoading, isError, error, refetch } = usePlatformOverview();
  if (isLoading) return <Spinner />;
  if (isError || !data) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  return (
    <>
      <PageHeader title="Platform overview" description="Every organization on this installation and who coordinates it." />
      <KpiStrip
        items={[
          { label: 'Organizations', value: data.organizations.total, icon: <Building2 />, hint: `${data.organizations.active} active · ${data.organizations.suspended} suspended` },
          { label: 'Users', value: data.users, icon: <Users />, tone: 'success', hint: 'across all organizations' },
          { label: 'Projects', value: data.projects, icon: <FolderKanban />, tone: 'warning' },
          { label: 'Project coordinators', value: data.coordinators, icon: <UserCog />, hint: 'appointed by root' },
        ]}
      />

      <div className="mt-6 space-y-6">
        <SecurityCard />
        <Card>
          <CardHeader
            title="Newest organizations"
            actions={
              <Link href={routes.platformOrganizations} className="text-xs font-medium text-brand hover:underline">
                View all
              </Link>
            }
          />
          <ul className="divide-y divide-border">
            {data.recentOrganizations.map((org) => (
              <li key={org.id}>
                <Link href={`${routes.platformOrganizations}?org=${org.id}`} className="flex items-center gap-3 px-[var(--card-p)] py-3 transition-colors hover:bg-surface-hover">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-ui bg-surface-muted text-xs font-semibold uppercase text-foreground-soft">
                    {org.name.slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{org.name}</span>
                    <span className="block text-xs text-muted">
                      {org._count.users} users · created {timeAgo(org.createdAt)}
                    </span>
                  </span>
                  {org.isActive ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Suspended</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

/** Root's installation-wide switch for two-step sign-in. */
function SecurityCard() {
  const { data } = usePlatformSettings();
  const update = useUpdatePlatformSettings();
  const required = data?.twoFactorRequired ?? false;
  return (
    <Card>
      <CardBody className="flex items-start gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-ui-lg bg-brand-soft text-brand">
          <ShieldCheck className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Require two-step sign-in for everyone</p>
          <p className="mt-0.5 text-sm text-muted">
            {required
              ? 'On: everyone signs in with a code from an authenticator app. People who have not set it up scan a QR code at their next sign-in.'
              : 'Off: only people who turned it on in their profile are asked for a code. Everyone else signs in with their password alone.'}
          </p>
        </div>
        <Switch
          checked={required}
          disabled={!data || update.isPending}
          onChange={(value) => update.mutate({ twoFactorRequired: value })}
          label="Require two-step sign-in for everyone"
        />
      </CardBody>
    </Card>
  );
}
