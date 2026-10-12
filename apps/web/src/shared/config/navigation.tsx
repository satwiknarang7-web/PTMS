import { MessageCircle, MessageSquareHeart } from 'lucide-react';
import { BarChart3, Building2, CalendarCheck, CalendarDays, Clock, FolderKanban, House, LayoutDashboard, Settings, ShieldCheck, Users, type LucideIcon } from 'lucide-react';
import { Permission } from '@/shared/constants/domain';
import { routes } from './routes';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Hidden unless the user holds this permission. */
  permission?: Permission;
  /** Counter shown as a badge (key of the nav-counts API response). */
  badge?: 'myOpenTasks' | 'unreadMessages';
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

/** Organization workspace; the project list is rendered below these links. */
export const NAVIGATION: NavSection[] = [
  {
    label: 'Workspace',
    items: [
      { label: 'Home', href: routes.home, icon: House },
      { label: 'My work', href: routes.myWork, icon: CalendarCheck, badge: 'myOpenTasks' },
      { label: 'Calendar', href: routes.calendar, icon: CalendarDays },
      { label: 'Messages', href: routes.messages, icon: MessageCircle, badge: 'unreadMessages' },
      { label: 'People', href: routes.people, icon: Users, permission: Permission.USERS_MANAGE },
      { label: 'Timesheets', href: routes.timesheets, icon: Clock },
      { label: 'Reports', href: routes.reports, icon: BarChart3, permission: Permission.REPORTS_VIEW },
    ],
  },
];

/** Client (viewer) accounts: their projects' dashboards and client meetings. */
export const VIEWER_NAVIGATION: NavSection[] = [
  {
    label: 'Workspace',
    items: [
      { label: 'Projects', href: routes.projects, icon: FolderKanban },
      { label: 'Calendar', href: routes.calendar, icon: CalendarDays },
      { label: 'Messages', href: routes.messages, icon: MessageCircle, badge: 'unreadMessages' },
    ],
  },
];

/** Paths a client may open; everything else sends them to their projects. */
export function viewerCanOpen(pathname: string): boolean {
  if (/^\/projects\/[^/]+\/(overview|board|gantt)$/.test(pathname)) return true;
  return ([routes.projects, routes.calendar, routes.messages, routes.profile, routes.settings, routes.settingsAppearance] as string[]).includes(pathname);
}

/** Pinned to the bottom of the workspace sidebar. */
export const FOOTER_NAVIGATION: NavItem[] = [{ label: 'Settings', href: routes.settings, icon: Settings }];

/** Navigation of the platform console (root account only). */
export const PLATFORM_NAVIGATION: NavSection[] = [
  {
    label: 'Platform',
    items: [
      { label: 'Overview', href: routes.platform, icon: LayoutDashboard },
      { label: 'Organizations', href: routes.platformOrganizations, icon: Building2 },
      { label: 'Root admins', href: routes.platformAdmins, icon: ShieldCheck },
      { label: 'Feedback', href: routes.platformFeedback, icon: MessageSquareHeart },
    ],
  },
];

/** Settings sub-pages; Appearance is personal and available to everyone. */
export const SETTINGS_NAVIGATION: (Omit<NavItem, 'icon'> & { description: string })[] = [
  { label: 'Appearance', href: routes.settingsAppearance, description: 'Theme, colors and fonts' },
  { label: 'Organization', href: routes.settingsOrganization, description: 'Name, brand color and working time', permission: Permission.USERS_VIEW },
  { label: 'Users', href: routes.settingsUsers, description: 'People and access', permission: Permission.USERS_VIEW },
  { label: 'Workflow', href: routes.settingsWorkflow, description: 'Statuses, priorities and severities', permission: Permission.USERS_VIEW },
];
