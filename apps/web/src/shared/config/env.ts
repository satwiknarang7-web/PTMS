/**
 * Public runtime configuration. Values are inlined by Next.js at build time from
 * NEXT_PUBLIC_* variables (see .env.example); fallbacks are the SegueIT branding.
 */
const toNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const appConfig = {
  name: process.env.NEXT_PUBLIC_APP_NAME || 'Project Tracker',
  tagline: process.env.NEXT_PUBLIC_APP_TAGLINE || 'Plan, track and deliver every project with confidence.',
  description: process.env.NEXT_PUBLIC_APP_DESCRIPTION || 'Plan roadmaps, run sprints, track billable time and keep every team aligned in one workspace.',
  /** Optional legal / trust links shown on the sign-in page; hidden when empty. */
  privacyUrl: process.env.NEXT_PUBLIC_PRIVACY_URL ?? '',
  termsUrl: process.env.NEXT_PUBLIC_TERMS_URL ?? '',
  securityUrl: process.env.NEXT_PUBLIC_SECURITY_URL ?? '',
  /** Where people without an account can ask for access; hidden when empty. */
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? '',
  version: process.env.NEXT_PUBLIC_APP_VERSION ?? '',
  /** How often the sidebar re-checks API health. */
  healthPollMs: toNumber(process.env.NEXT_PUBLIC_HEALTH_POLL_MS, 60_000),
  companyName: process.env.NEXT_PUBLIC_COMPANY_NAME || 'SegueIT',
  /** Company logo for light surfaces and its variant for dark surfaces (files in /public). */
  logoUrl: process.env.NEXT_PUBLIC_LOGO_URL || '/brand/segueit-logo.png',
  logoDarkUrl: process.env.NEXT_PUBLIC_LOGO_DARK_URL || '/brand/segueit-logo-dark.png',
  brandColor: process.env.NEXT_PUBLIC_BRAND_COLOR ?? '#0b5cad',
  apiBasePath: process.env.NEXT_PUBLIC_API_BASE_PATH ?? '/api',
  defaultPageSize: toNumber(process.env.NEXT_PUBLIC_DEFAULT_PAGE_SIZE, 20),
  boardPageSize: toNumber(process.env.NEXT_PUBLIC_BOARD_PAGE_SIZE, 200),
  notificationPollMs: toNumber(process.env.NEXT_PUBLIC_NOTIFICATION_POLL_MS, 30_000),
  dateFormat: process.env.NEXT_PUBLIC_DATE_FORMAT ?? 'dd MMM yyyy',
  /** Compact format used inside table cells and timelines. */
  shortDateFormat: process.env.NEXT_PUBLIC_SHORT_DATE_FORMAT ?? 'MMM d',
} as const;
