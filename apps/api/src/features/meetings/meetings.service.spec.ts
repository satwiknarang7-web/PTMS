import { NotificationType } from '../../common/constants/domain.constants';
import { MeetingsService } from './meetings.service';

const ORG = 'org-1';
const now = new Date('2026-10-09T09:00:00Z');

function setup({ timezone = 'UTC', meetings = [] as object[], digestHour = 8 } = {}) {
  const prisma = {
    organization: { findUnique: jest.fn().mockResolvedValue({ timezone, isActive: true }) },
    meeting: { findMany: jest.fn().mockResolvedValue(meetings), updateMany: jest.fn().mockResolvedValue({ count: meetings.length }) },
    user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }]) },
  };
  const events = { notify: jest.fn() };
  const config = { get: () => ({ digestHour }) };
  const service = new MeetingsService(prisma as never, {} as never, events as never, config as never);
  return { service, prisma, events };
}

const meeting = (overrides: object = {}) => ({
  id: 'm1',
  title: 'Client demo',
  type: 'CLIENT',
  link: 'https://meet.example.com/x',
  startsAt: new Date('2026-10-09T14:00:00Z'),
  endsAt: new Date('2026-10-09T15:00:00Z'),
  project: null,
  createdById: 'coordinator',
  createdBy: { isActive: true },
  ...overrides,
});

describe('MeetingsService.sendReminders', () => {
  it('waits until the digest hour in the organization time zone', async () => {
    const { service, prisma, events } = setup({ timezone: 'America/New_York', meetings: [meeting()] });
    await service.sendReminders(ORG, undefined, now); // 05:00 in New York, meeting at 10:00
    expect(events.notify).not.toHaveBeenCalled();
    expect(prisma.meeting.updateMany).not.toHaveBeenCalled();
  });

  it('announces a meeting that starts before the digest hour an hour ahead', async () => {
    const early = meeting({ startsAt: new Date('2026-10-09T09:45:00Z'), endsAt: new Date('2026-10-09T10:15:00Z') });
    const { service, events } = setup({ timezone: 'America/New_York', meetings: [early] });
    await service.sendReminders(ORG, undefined, now); // 05:00 in New York, meeting at 05:45
    expect(events.notify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Today {{time:2026-10-09T09:45:00.000Z}} · Client demo', link: '/calendar?date=2026-10-09' }));
  });

  it('tells everyone in the organization about organization-wide meetings today, once', async () => {
    const { service, prisma, events } = setup({ meetings: [meeting()] });
    await service.sendReminders(ORG, undefined, now);
    expect(events.notify).toHaveBeenCalledWith(
      expect.objectContaining({ recipientIds: ['u1', 'u2', 'u3'], type: NotificationType.MEETING_TODAY, title: expect.stringMatching(/^Today {{time:.+}} · Client demo$/) }),
    );
    expect(prisma.meeting.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['m1'] } }, data: { reminderSentAt: now } });
  });

  it("only tells a project's members (and its organizer) about its meetings", async () => {
    const project = { name: 'Website', members: [{ userId: 'u2' }] };
    const { service, prisma, events } = setup({ meetings: [meeting({ project, createdById: 'coordinator' })] });
    await service.sendReminders(ORG, undefined, now);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    // The coordinator who scheduled it is told too.
    expect(events.notify).toHaveBeenCalledWith(expect.objectContaining({ recipientIds: ['u2', 'coordinator'] }));
  });

  it('leaves out an organizer whose account has been deactivated', async () => {
    const project = { name: 'Website', members: [{ userId: 'u2' }] };
    const { service, events } = setup({ meetings: [meeting({ project, createdBy: { isActive: false } })] });
    await service.sendReminders(ORG, undefined, now);
    expect(events.notify).toHaveBeenCalledWith(expect.objectContaining({ recipientIds: ['u2'] }));
  });

  it('skips meetings on another local day', async () => {
    const tomorrow = meeting({ startsAt: new Date('2026-10-10T08:00:00Z'), endsAt: new Date('2026-10-10T09:00:00Z') });
    const { service, events } = setup({ meetings: [tomorrow] });
    await service.sendReminders(ORG, undefined, now);
    expect(events.notify).not.toHaveBeenCalled();
  });
});
