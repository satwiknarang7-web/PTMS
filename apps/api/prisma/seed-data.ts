/**
 * Data created by `npm run db:seed`. The root account is always created; everything marked
 * "demo" only when SEED_DEMO_DATA=true. Dates are offsets (in days) from the day the seed
 * runs, so the demo always looks current.
 * The handle "admin" refers to the demo organization's first project coordinator.
 *
 * These are first-run credentials: change the passwords after the first sign-in.
 */
import { OrgRole } from '../src/common/constants/roles.constants';
import { MeetingType } from '../src/features/meetings/meeting.constants';

/**
 * First root admin: creates organizations, appoints their project coordinators and adds other
 * root admins from the platform console. ROOT_EMAIL / ROOT_PASSWORD override these values.
 */
export const ROOT_ACCOUNT = {
  email: process.env.ROOT_EMAIL || 'satwik.narang@segueit.com',
  password: process.env.ROOT_PASSWORD || 'change@123',
  firstName: 'Satwik',
  lastName: 'Narang',
  jobTitle: 'Platform Administrator',
};

/** Demo organization, its first project coordinator and the password shared by all demo users. */
export const DEMO_ORGANIZATION = {
  name: 'SegueIT',
  coordinator: { email: 'admin@segueit.com', password: 'ChangeMe@123', firstName: 'System', lastName: 'Administrator', jobTitle: 'Project Coordinator' },
  userPassword: 'Welcome@123',
};

export const DEMO_USERS = [
  { handle: 'priya.sharma', firstName: 'Priya', lastName: 'Sharma', jobTitle: 'Delivery Manager', role: OrgRole.PROJECT_COORDINATOR, hourlyRate: 65 },
  { handle: 'arjun.mehta', firstName: 'Arjun', lastName: 'Mehta', jobTitle: 'Senior Engineer', role: OrgRole.MEMBER, hourlyRate: 55 },
  { handle: 'neha.verma', firstName: 'Neha', lastName: 'Verma', jobTitle: 'Frontend Engineer', role: OrgRole.MEMBER, hourlyRate: 45 },
  { handle: 'rahul.iyer', firstName: 'Rahul', lastName: 'Iyer', jobTitle: 'QA Engineer', role: OrgRole.MEMBER, hourlyRate: 40 },
  { handle: 'sara.khan', firstName: 'Sara', lastName: 'Khan', jobTitle: 'UX Designer', role: OrgRole.MEMBER, hourlyRate: 50 },
  { handle: 'client.viewer', firstName: 'Client', lastName: 'Stakeholder', jobTitle: 'Product Owner', role: OrgRole.MEMBER, hourlyRate: null },
] as const;

interface DemoTask {
  title: string;
  description?: string;
  status: string;
  priority: string;
  startOffset: number;
  dueOffset: number;
  estimate: number;
  progress: number;
  assignees: string[];
  comment?: string;
}

interface DemoProject {
  key: string;
  name: string;
  description: string;
  color: string;
  status: string;
  owner: string;
  members: string[];
  startOffset: number;
  endOffset: number;
  budgetHours: number;
  milestones: { name: string; description: string; startOffset: number; dueOffset: number; completed?: boolean }[];
  taskLists: { name: string; milestone: string; tasks: DemoTask[] }[];
  dependencies: [successor: string, predecessor: string][];
  issues: {
    title: string;
    description: string;
    status: string;
    priority: string;
    severity: string;
    reporter: string;
    assignee?: string;
    dueOffset: number;
    createdOffset: number;
  }[];
}

export const DEMO_PROJECTS: DemoProject[] = [
  {
    key: 'WEB',
    name: 'Corporate Website Revamp',
    description: 'Redesign and rebuild the public website with a headless CMS, improved SEO and accessibility.',
    color: '#2563eb',
    status: 'Active',
    owner: 'priya.sharma',
    members: ['arjun.mehta', 'neha.verma', 'rahul.iyer', 'sara.khan', 'client.viewer'],
    startOffset: -30,
    endOffset: 45,
    budgetHours: 640,
    milestones: [
      { name: 'Discovery & Design', description: 'Research, IA and visual design sign-off', startOffset: -30, dueOffset: -10, completed: true },
      { name: 'Build', description: 'Implementation of templates and CMS integration', startOffset: -9, dueOffset: 20 },
      { name: 'Launch', description: 'QA, content migration and go-live', startOffset: 21, dueOffset: 45 },
    ],
    taskLists: [
      {
        name: 'Design',
        milestone: 'Discovery & Design',
        tasks: [
          { title: 'Stakeholder interviews', status: 'Completed', priority: 'Medium', startOffset: -30, dueOffset: -26, estimate: 12, progress: 100, assignees: ['sara.khan'] },
          { title: 'Information architecture', status: 'Completed', priority: 'High', startOffset: -25, dueOffset: -20, estimate: 16, progress: 100, assignees: ['sara.khan', 'priya.sharma'] },
          { title: 'High fidelity mockups', status: 'Completed', priority: 'High', startOffset: -19, dueOffset: -11, estimate: 40, progress: 100, assignees: ['sara.khan'], comment: 'Final designs uploaded to the shared drive.' },
        ],
      },
      {
        name: 'Development',
        milestone: 'Build',
        tasks: [
          { title: 'Set up headless CMS', status: 'Completed', priority: 'High', startOffset: -9, dueOffset: -5, estimate: 16, progress: 100, assignees: ['arjun.mehta'] },
          { title: 'Build page templates', status: 'In Progress', priority: 'High', startOffset: -4, dueOffset: 8, estimate: 60, progress: 55, assignees: ['neha.verma', 'arjun.mehta'], comment: 'Home and landing templates are done, working on blog next.' },
          { title: 'Integrate search', status: 'Open', priority: 'Medium', startOffset: 5, dueOffset: 14, estimate: 24, progress: 0, assignees: ['arjun.mehta'] },
          { title: 'Accessibility review', status: 'In Review', priority: 'Critical', startOffset: -3, dueOffset: -1, estimate: 12, progress: 80, assignees: ['rahul.iyer'] },
          { title: 'Performance budget & Core Web Vitals', status: 'Open', priority: 'Medium', startOffset: 10, dueOffset: 19, estimate: 16, progress: 0, assignees: ['neha.verma'] },
        ],
      },
      {
        name: 'Go-live',
        milestone: 'Launch',
        tasks: [
          { title: 'Content migration', status: 'Open', priority: 'High', startOffset: 21, dueOffset: 33, estimate: 48, progress: 0, assignees: ['priya.sharma'] },
          { title: 'User acceptance testing', status: 'Open', priority: 'High', startOffset: 30, dueOffset: 40, estimate: 32, progress: 0, assignees: ['rahul.iyer'] },
          { title: 'Production cut-over', status: 'Open', priority: 'Critical', startOffset: 42, dueOffset: 45, estimate: 8, progress: 0, assignees: ['arjun.mehta'] },
        ],
      },
    ],
    dependencies: [
      ['Information architecture', 'Stakeholder interviews'],
      ['High fidelity mockups', 'Information architecture'],
      ['Build page templates', 'Set up headless CMS'],
      ['Integrate search', 'Build page templates'],
      ['User acceptance testing', 'Content migration'],
      ['Production cut-over', 'User acceptance testing'],
    ],
    issues: [
      { title: 'Navigation menu overlaps hero on tablets', description: 'At 768px the mega menu covers the hero CTA.', status: 'Open', priority: 'High', severity: 'Major', reporter: 'rahul.iyer', assignee: 'neha.verma', dueOffset: 3, createdOffset: -6 },
      { title: 'CMS preview link returns 404', description: 'Draft preview URLs are not routed correctly.', status: 'In Progress', priority: 'Critical', severity: 'Critical', reporter: 'priya.sharma', assignee: 'arjun.mehta', dueOffset: 1, createdOffset: -4 },
      { title: 'Footer links missing aria-labels', description: 'Social icons have no accessible names.', status: 'Closed', priority: 'Low', severity: 'Minor', reporter: 'rahul.iyer', assignee: 'neha.verma', dueOffset: -3, createdOffset: -12 },
    ],
  },
  {
    key: 'MOB',
    name: 'Field Service Mobile App',
    description: 'Offline-first mobile app for technicians to manage work orders, capture signatures and sync data.',
    color: '#9333ea',
    status: 'Active',
    owner: 'arjun.mehta',
    members: ['neha.verma', 'rahul.iyer', 'sara.khan'],
    startOffset: -15,
    endOffset: 75,
    budgetHours: 900,
    milestones: [
      { name: 'MVP', description: 'Work order list, details and offline sync', startOffset: -15, dueOffset: 25 },
      { name: 'Pilot release', description: 'Pilot with 20 technicians', startOffset: 26, dueOffset: 75 },
    ],
    taskLists: [
      {
        name: 'Core features',
        milestone: 'MVP',
        tasks: [
          { title: 'Offline data layer', status: 'In Progress', priority: 'Critical', startOffset: -15, dueOffset: -2, estimate: 80, progress: 70, assignees: ['arjun.mehta'], comment: 'Conflict resolution strategy needs review.' },
          { title: 'Work order screens', status: 'In Progress', priority: 'High', startOffset: -8, dueOffset: 10, estimate: 56, progress: 40, assignees: ['neha.verma'] },
          { title: 'Signature capture', status: 'Open', priority: 'Medium', startOffset: 8, dueOffset: 18, estimate: 20, progress: 0, assignees: ['neha.verma'] },
          { title: 'App onboarding flow', status: 'Open', priority: 'Low', startOffset: 12, dueOffset: 22, estimate: 16, progress: 0, assignees: ['sara.khan'] },
        ],
      },
      {
        name: 'Quality',
        milestone: 'Pilot release',
        tasks: [
          { title: 'Automated E2E test suite', status: 'Open', priority: 'High', startOffset: 20, dueOffset: 40, estimate: 48, progress: 0, assignees: ['rahul.iyer'] },
          { title: 'Pilot feedback triage', status: 'Open', priority: 'Medium', startOffset: 45, dueOffset: 70, estimate: 30, progress: 0, assignees: ['arjun.mehta', 'sara.khan'] },
        ],
      },
    ],
    dependencies: [
      ['Work order screens', 'Offline data layer'],
      ['Signature capture', 'Work order screens'],
      ['Pilot feedback triage', 'Automated E2E test suite'],
    ],
    issues: [
      { title: 'Sync fails on flaky networks', description: 'Partial uploads are not retried.', status: 'Open', priority: 'Critical', severity: 'Show Stopper', reporter: 'rahul.iyer', assignee: 'arjun.mehta', dueOffset: 2, createdOffset: -3 },
      { title: 'Dark mode contrast too low', description: 'Secondary text fails WCAG AA.', status: 'To be Tested', priority: 'Medium', severity: 'Minor', reporter: 'sara.khan', assignee: 'neha.verma', dueOffset: 6, createdOffset: -5 },
    ],
  },
  {
    key: 'ERP',
    name: 'ERP Data Migration',
    description: 'Migrate finance and inventory data from the legacy ERP with reconciliation and audit trail.',
    color: '#ea580c',
    status: 'Planning',
    owner: 'priya.sharma',
    members: ['arjun.mehta', 'rahul.iyer'],
    startOffset: 5,
    endOffset: 120,
    budgetHours: 400,
    milestones: [{ name: 'Data mapping', description: 'Field-level mapping approved by finance', startOffset: 5, dueOffset: 35 }],
    taskLists: [
      {
        name: 'Analysis',
        milestone: 'Data mapping',
        tasks: [
          { title: 'Inventory legacy tables', status: 'Open', priority: 'High', startOffset: 5, dueOffset: 15, estimate: 24, progress: 0, assignees: ['arjun.mehta'] },
          { title: 'Define reconciliation rules', status: 'Open', priority: 'Medium', startOffset: 14, dueOffset: 30, estimate: 20, progress: 0, assignees: ['priya.sharma', 'rahul.iyer'] },
        ],
      },
    ],
    dependencies: [['Define reconciliation rules', 'Inventory legacy tables']],
    issues: [],
  },
];

/** Demo meetings: `project` is a demo project key, or null for the whole organization. Times are UTC. */
export const DEMO_MEETINGS = [
  { title: 'Weekly team sync', type: MeetingType.INTERNAL, project: null, dayOffset: 0, start: '09:30', minutes: 30, link: 'https://meet.example.com/team-sync', description: 'Status round, blockers and plans for the week.' },
  { title: 'Website demo with client', type: MeetingType.CLIENT, project: 'WEB', dayOffset: 0, start: '14:00', minutes: 60, link: 'https://meet.example.com/web-client-demo', description: 'Walk the client through the new page templates.' },
  { title: 'Sprint planning', type: MeetingType.INTERNAL, project: 'MOB', dayOffset: 1, start: '10:00', minutes: 60, link: 'https://meet.example.com/mob-planning' },
  { title: 'ERP kick-off with finance', type: MeetingType.CLIENT, project: 'ERP', dayOffset: 3, start: '11:00', minutes: 45, link: 'https://meet.example.com/erp-kickoff' },
  { title: 'Design review', type: MeetingType.INTERNAL, project: 'WEB', dayOffset: 7, start: '15:00', minutes: 45, link: 'https://meet.example.com/design-review' },
] as const;
