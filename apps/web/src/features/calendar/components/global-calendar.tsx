'use client';

import { useState } from 'react';
import { useSession } from '@/features/auth/api';
import { useProjectNavigation } from '@/features/projects/api';
import { OrgRole } from '@/shared/constants/domain';
import { Select } from '@/shared/ui/form';
import { PageHeader } from '@/shared/ui/layout';
import { TaskCalendar } from './task-calendar';

/** Organization-wide calendar: every visible project's work plus all meetings. */
export function GlobalCalendar() {
  const { data: projects } = useProjectNavigation();
  const { data: session } = useSession();
  const clientView = session?.role === OrgRole.VIEWER;
  const [scope, setScope] = useState('');
  const query = scope === 'mine' ? { mine: true } : scope ? { projectId: scope } : {};

  return (
    <>
      <PageHeader
        title="Calendar"
        description={clientView ? 'Client meetings for your projects. Schedule one with the Meeting button.' : 'Meetings and work across all your projects.'}
        actions={
          <Select className="w-56" value={scope} onChange={(event) => setScope(event.target.value)} aria-label="Whose work to show">
            <option value="">All projects</option>
            {!clientView && <option value="mine">Only my tasks</option>}
            {projects?.length ? (
              <optgroup label="Project">
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </Select>
        }
      />
      <TaskCalendar
        query={{ ...query, rootOnly: true }}
        canEdit
        showProject={!query.projectId}
        meetings={query.projectId ? { projectId: query.projectId } : {}}
        storageKey="calendar.global"
        defaultSpans={false}
        clientView={clientView}
      />
    </>
  );
}
