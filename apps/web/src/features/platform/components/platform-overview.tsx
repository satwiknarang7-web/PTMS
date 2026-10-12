'use client';

import { Building2, FolderKanban, UserCog, Users } from 'lucide-react';
import Link from 'next/link';
import { routes } from '@/shared/config/routes';
import { errorMessage } from '@/shared/lib/api-client';
import { timeAgo } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { Card, CardBody, CardHeader } from '@/shared/ui/card';
import { ErrorState, Spinner } from '@/shared/ui/feedback';
import { PageHeader } from '@/shared/ui/layout';
import { KpiStrip } from '@/shared/components/kpi-strip';
import { usePlatformOverview } from '../api';

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

      <div className="mt-6">
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
