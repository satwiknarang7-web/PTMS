'use client';

import {
  ArrowLeftRight,
  ChevronRight,
  ChevronsUpDown,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  Sun,
  UserRound,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useLogout, useSession } from '@/features/auth/api';
import type { SessionUser } from '@/features/auth/types';
import { useNavCounts } from '@/features/dashboard/api';
import { NotificationBell } from '@/features/notifications/components/notification-bell';
import { useExitWorkspace } from '@/features/platform/api';
import { ProjectsNav } from '@/features/projects/components/projects-nav';
import { GlobalSearch } from '@/features/search/components/global-search';
import { appConfig } from '@/shared/config/env';
import { FOOTER_NAVIGATION, NAVIGATION, PLATFORM_NAVIGATION, SETTINGS_NAVIGATION, VIEWER_NAVIGATION, viewerCanOpen, type NavItem, type NavSection } from '@/shared/config/navigation';
import { routes } from '@/shared/config/routes';
import { OrgRole, PLATFORM_ROOT_ROLE, roleLabel } from '@/shared/constants/domain';
import { useSystemStatus } from '@/shared/hooks/use-system-status';
import { cn, fullName } from '@/shared/lib/utils';
import type { ThemeMode } from '@/shared/theme/theme.config';
import { useTheme } from '@/shared/theme/theme-provider';
import { useNavCollapsed } from '@/shared/theme/use-nav-collapsed';
import { Avatar } from '@/shared/ui/avatar';
import { Dropdown, DropdownItem, DropdownSeparator } from '@/shared/ui/dropdown';
import { ErrorState, Spinner } from '@/shared/ui/feedback';
import { BrandLogo } from './brand-logo';
import { BrandingStyles } from './branding-styles';

const isActive = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** `tenant` is the organization workspace; `platform` is the root account's console. */
export type ShellVariant = 'tenant' | 'platform';

/** Visible identity of the current workspace in the sidebar. */
interface WorkspaceInfo {
  name: string;
  subtitle: string;
  href: string;
}

const isRootUser = (user: SessionUser) => user.role === PLATFORM_ROOT_ROLE;

function workspaceOf(user: SessionUser, variant: ShellVariant): WorkspaceInfo {
  if (variant === 'platform' || !user.organization) {
    return { name: 'Platform console', subtitle: 'Root access', href: routes.platform };
  }
  return {
    name: user.organization.name,
    subtitle: isRootUser(user) ? 'Opened with root access' : `${roleLabel(user.role)} workspace`,
    href: routes.settings,
  };
}

export function AppShell({ children, variant = 'tenant' }: { children: ReactNode; variant?: ShellVariant }) {
  const { data: user, isLoading, isError, refetch } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const nav = useNavCollapsed();
  const platform = variant === 'platform';
  const root = !!user && isRootUser(user);
  // The platform console is root-only; a workspace needs an organization (root gets one by opening it).
  const viewer = !!user && user.role === OrgRole.VIEWER;
  // Clients only open their projects' dashboards and the calendar; anything else leads to one of those.
  const viewerTarget = viewer && !platform && !viewerCanOpen(pathname) ? viewerRedirect(pathname) : null;
  const misplaced = !!user && ((platform ? !root : !user.organization) || !!viewerTarget);

  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    if (viewerTarget) router.replace(viewerTarget);
    else if (misplaced) router.replace(platform ? routes.home : routes.platform);
  }, [misplaced, platform, router, viewerTarget]);

  if (isLoading || misplaced) return <Spinner className="min-h-screen" label="Loading your workspace" />;
  if (isError || !user) return <ErrorState message="We could not load your session." onRetry={() => refetch()} />;

  const navigation = platform ? PLATFORM_NAVIGATION : viewer ? VIEWER_NAVIGATION : NAVIGATION;
  const workspace = workspaceOf(user, variant);
  const sidebarProps = { user, pathname, navigation, workspace, tenant: !platform };

  return (
    <div className="min-h-screen">
      <BrandingStyles color={user.organization?.primaryColor} />

      <aside data-collapsible className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sidebar-w)] transition-[width] duration-200 ease-out lg:block">
        <Sidebar {...sidebarProps} collapsed={nav.collapsed} onToggleCollapse={nav.toggle} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-overlay" onClick={() => setMobileOpen(false)} />
          <aside className="relative h-full w-72 max-w-[85vw] animate-slide-in-left shadow-ui-lg">
            <Sidebar {...sidebarProps} onClose={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="transition-[padding] duration-200 ease-out lg:pl-[var(--sidebar-w)]">
        {root && !platform && user.organization && <RootWorkspaceBanner organizationName={user.organization.name} />}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-surface/85 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-surface/75 sm:px-6">
          <button
            type="button"
            className="-ml-1 flex size-9 items-center justify-center rounded-ui text-muted hover:bg-surface-muted hover:text-foreground lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </button>
          {/* The sidebar (and its logo) is hidden on small screens. */}
          <Link href={platform ? routes.platform : routes.home} aria-label={`${appConfig.name} home`} className="shrink-0 lg:hidden">
            <BrandLogo compact className="[&_img]:h-7 [&_img]:max-w-[6.5rem]" />
          </Link>
          <div className="flex min-w-0 flex-1 items-center justify-end sm:justify-start">{!platform && !viewer && <GlobalSearch />}</div>
          <div className="flex items-center gap-1">
            {!platform && <NotificationBell />}
            <div className="mx-1.5 hidden h-6 w-px bg-border sm:block" />
            <UserMenu user={user} variant={variant} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

interface SidebarProps {
  user: SessionUser;
  pathname: string;
  navigation: NavSection[];
  workspace: WorkspaceInfo;
  /** Organization workspace: shows counters, the project list and settings. */
  tenant: boolean;
  /** Mobile drawer close handler. */
  onClose?: () => void;
  /** Desktop only: icon-rail mode. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

function Sidebar({ user, pathname, navigation, workspace, tenant, onClose, collapsed, onToggleCollapse }: SidebarProps) {
  const { data: counts } = useNavCounts(tenant);
  const visible = (items: NavItem[]) => items.filter((item) => !item.permission || user.permissions.includes(item.permission));

  return (
    <div data-sidebar-panel className="flex h-full flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-4 collapsed:justify-center collapsed:px-0">
        <Link href={navigation[0].items[0].href} aria-label={`${appConfig.name} home`} className="min-w-0 text-sidebar-heading collapsed:hidden">
          <BrandLogo className="flex-col items-start gap-1 [&_img]:h-8 [&_img]:max-w-[9.5rem] [&>span]:text-[10px] [&>span]:leading-none [&>span]:font-medium [&>span]:uppercase [&>span]:tracking-[0.14em] [&>span]:opacity-70" />
        </Link>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            title={`${collapsed ? 'Expand' : 'Collapse'} sidebar (Ctrl+B)`}
            className="flex size-8 shrink-0 items-center justify-center rounded-ui text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-foreground"
          >
            <PanelLeftClose className="size-[18px] collapsed:hidden" />
            <PanelLeftOpen className="hidden size-[18px] collapsed:block" />
          </button>
        )}
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close navigation" className="rounded-ui p-1.5 text-sidebar-muted hover:bg-sidebar-hover">
            <X className="size-5" />
          </button>
        )}
      </div>

      <nav className="scrollbar-thin flex-1 space-y-6 overflow-y-auto overflow-x-hidden px-3 py-4 collapsed:space-y-3">
        {navigation.map((section) => {
          const items = visible(section.items);
          if (!items.length) return null;
          return (
            <div key={section.label}>
              <p className="mb-1.5 truncate px-3 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted collapsed:hidden">{section.label}</p>
              <div aria-hidden className="mx-auto mb-3 hidden h-px w-6 bg-sidebar-border collapsed:block [[data-sidebar=dark]_&]:bg-white/10" />
              <ul className="space-y-0.5">
                {items.map((item) => (
                  <li key={item.href}>
                    <SidebarLink
                      item={item}
                      active={item.href === routes.platform ? pathname === item.href : isActive(pathname, item.href)}
                      count={item.badge ? counts?.[item.badge] : undefined}
                    />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {tenant && <ProjectsNav pathname={pathname} />}
      </nav>

      {tenant && (
        <ul className="shrink-0 space-y-0.5 border-t border-sidebar-border px-3 pt-3">
          {visible(FOOTER_NAVIGATION).map((item) => (
            <li key={item.href}>
              <SidebarLink item={item} active={isActive(pathname, item.href)} />
            </li>
          ))}
        </ul>
      )}

      <div className="shrink-0 border-t border-sidebar-border p-3 [ul+&]:border-t-0">
        <WorkspaceMenu user={user} workspace={workspace} tenant={tenant} />
      </div>
    </div>
  );
}

/**
 * Compact workspace card at the bottom of the sidebar. Opens upwards into a
 * small menu with the workspace's settings pages, the root console switch and
 * the API status, which used to be a separate always-visible line.
 */
function WorkspaceMenu({ user, workspace, tenant }: { user: SessionUser; workspace: WorkspaceInfo; tenant: boolean }) {
  const router = useRouter();
  const exit = useExitWorkspace();
  const { operational, checking } = useSystemStatus();
  const status = checking ? 'Checking…' : operational ? 'Operational' : 'Degraded';
  const statusDot = checking ? 'bg-sidebar-muted' : operational ? 'bg-success' : 'bg-danger';
  const settings = tenant ? SETTINGS_NAVIGATION.filter((item) => !item.permission || user.permissions.includes(item.permission)) : [];

  return (
    <Dropdown
      align="left"
      className="w-60"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          title={`${workspace.name} · API ${status}`}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-ui px-2 py-1.5 text-left transition-colors hover:bg-sidebar-hover collapsed:justify-center collapsed:px-0',
            open && 'bg-sidebar-hover',
          )}
        >
          <span className="relative flex size-8 shrink-0 items-center justify-center rounded-ui bg-sidebar-hover text-xs font-semibold uppercase text-sidebar-heading">
            {initialsOf(workspace.name)}
            <span className={cn('absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-[var(--sidebar)]', statusDot)} aria-hidden />
          </span>
          <span className="min-w-0 flex-1 collapsed:hidden">
            <span className="block truncate text-sm font-medium text-sidebar-heading">{workspace.name}</span>
            <span className="block truncate text-[11px] text-sidebar-muted">{workspace.subtitle}</span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-sidebar-muted collapsed:hidden" />
        </button>
      )}
    >
      {(close) => {
        const go = (href: string) => {
          close();
          router.push(href);
        };
        return (
          <>
            <div className="px-2.5 py-2">
              <p className="truncate text-sm font-medium text-foreground">{workspace.name}</p>
              <p className="truncate text-xs text-muted">{workspace.subtitle}</p>
            </div>
            {settings.length > 0 && (
              <>
                <DropdownSeparator />
                {settings.map((item) => (
                  <DropdownItem key={item.href} onClick={() => go(item.href)}>
                    <Settings /> <span className="flex-1">{item.label}</span>
                    <ChevronRight className="!size-3.5" />
                  </DropdownItem>
                ))}
              </>
            )}
            {!tenant && (
              <>
                <DropdownSeparator />
                <DropdownItem onClick={() => go(workspace.href)}>
                  <ShieldCheck /> Platform overview
                </DropdownItem>
              </>
            )}
            {tenant && isRootUser(user) && (
              <DropdownItem
                onClick={() => {
                  close();
                  exit.mutate();
                }}
              >
                <ArrowLeftRight /> Back to platform console
              </DropdownItem>
            )}
            <DropdownSeparator />
            <div className="flex items-center justify-between px-2.5 py-1.5 font-mono text-[11px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className={cn('size-1.5 rounded-full', statusDot)} /> API {status.toLowerCase()}
              </span>
              {appConfig.version && <span>v{appConfig.version}</span>}
            </div>
          </>
        );
      }}
    </Dropdown>
  );
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('');
}

function SidebarLink({ item, active, count }: { item: NavItem; active: boolean; count?: number }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      title={item.label}
      className={cn(
        'group flex items-center gap-3 rounded-ui px-3 py-2 text-sm font-medium transition-colors collapsed:justify-center collapsed:px-0',
        active ? 'bg-sidebar-active text-sidebar-active-foreground' : 'text-sidebar-foreground hover:bg-sidebar-hover',
      )}
    >
      <Icon className={cn('size-[18px] shrink-0', active ? 'text-sidebar-active-foreground' : 'text-sidebar-muted group-hover:text-sidebar-foreground')} />
      <span className="min-w-0 flex-1 truncate whitespace-nowrap collapsed:sr-only">{item.label}</span>
      {!!count && (
        <span
          className={cn(
            'min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold tabular-nums leading-5 collapsed:hidden',
            active ? 'bg-brand text-brand-foreground' : 'bg-sidebar-hover text-sidebar-muted',
          )}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}

/** Shown while the root account works inside an organization. */
function RootWorkspaceBanner({ organizationName }: { organizationName: string }) {
  const exit = useExitWorkspace();
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 bg-foreground px-4 py-2 text-xs text-background sm:px-6">
      <span className="flex min-w-0 items-center gap-2">
        <ShieldCheck className="size-4 shrink-0" />
        <span className="truncate">
          Root access · You are managing <strong className="font-semibold">{organizationName}</strong> with project coordinator rights.
        </span>
      </span>
      <button
        type="button"
        onClick={() => exit.mutate()}
        disabled={exit.isPending}
        className="inline-flex shrink-0 items-center gap-1.5 font-medium underline-offset-4 hover:underline disabled:opacity-60"
      >
        <ArrowLeftRight className="size-3.5" /> Back to platform console
      </button>
    </div>
  );
}

const THEME_CHOICES: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
  { mode: 'light', label: 'Light', icon: Sun },
  { mode: 'dark', label: 'Dark', icon: Moon },
  { mode: 'system', label: 'System', icon: Monitor },
];

function UserMenu({ user, variant }: { user: SessionUser; variant: ShellVariant }) {
  const root = isRootUser(user);
  const exit = useExitWorkspace();
  const links =
    variant === 'platform'
      ? { profile: routes.platformProfile, appearance: routes.platformAppearance }
      : { profile: routes.profile, appearance: routes.settingsAppearance };
  const logout = useLogout();
  const router = useRouter();
  const { appearance, update } = useTheme();

  const signOut = () =>
    logout.mutate(undefined, {
      onSettled: () => {
        router.replace(routes.login);
        router.refresh();
      },
    });

  return (
    <Dropdown
      trigger={({ toggle }) => (
        <button type="button" onClick={toggle} className="flex items-center gap-2.5 rounded-ui p-1 transition-colors hover:bg-surface-muted sm:pr-2">
          <Avatar user={user} />
          <span className="hidden text-left sm:block">
            <span className="block max-w-40 truncate text-sm font-medium leading-tight">{fullName(user)}</span>
            <span className="block text-[11px] leading-tight text-muted">{roleLabel(user.role)}</span>
          </span>
          <ChevronsUpDown className="hidden size-3.5 text-muted sm:block" />
        </button>
      )}
    >
      {(close) => {
        const go = (href: string) => {
          close();
          router.push(href);
        };
        return (
          <>
            <div className="px-2.5 py-2">
              <p className="truncate text-sm font-medium">{fullName(user)}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
            </div>
            <DropdownSeparator />
            <DropdownItem onClick={() => go(links.profile)}>
              <UserRound /> My profile
            </DropdownItem>
            <DropdownItem onClick={() => go(links.appearance)}>
              <Palette /> Appearance
            </DropdownItem>
            <div className="flex items-center justify-between gap-3 px-2.5 py-1.5">
              <span className="text-sm text-foreground-soft">Theme</span>
              <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-ui border border-border bg-surface-muted p-0.5">
                {THEME_CHOICES.map(({ mode, label, icon: Icon }) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={appearance.mode === mode}
                    aria-label={label}
                    title={label}
                    onClick={() => update({ mode })}
                    className={cn(
                      'flex size-7 items-center justify-center rounded-[calc(var(--radius)-2px)] transition-colors',
                      appearance.mode === mode ? 'bg-surface text-foreground shadow-ui-sm' : 'text-muted hover:text-foreground',
                    )}
                  >
                    <Icon className="size-3.5" />
                  </button>
                ))}
              </div>
            </div>
            {root && variant === 'tenant' && (
              <DropdownItem
                onClick={() => {
                  close();
                  exit.mutate();
                }}
              >
                <ArrowLeftRight /> Platform console
              </DropdownItem>
            )}
            <DropdownSeparator />
            <DropdownItem onClick={signOut} danger>
              <LogOut /> Sign out
            </DropdownItem>
          </>
        );
      }}
    </Dropdown>
  );
}

/** Where a client lands instead of a page they cannot open: the project's dashboard, else their projects. */
function viewerRedirect(pathname: string): string {
  const project = /^\/projects\/([^/]+)/.exec(pathname)?.[1];
  return project ? routes.projectOverview(project) : routes.projects;
}
