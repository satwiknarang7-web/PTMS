import { clsx, type ClassValue } from 'clsx';
import { format, formatDistanceToNowStrict, isValid } from 'date-fns';
import { twMerge } from 'tailwind-merge';
import { appConfig } from '@/shared/config/env';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type DateInput = string | Date | null | undefined;

function toDate(value: DateInput): Date | null {
  if (!value) return null;
  // `new Date()` treats date-only strings (YYYY-MM-DD) as UTC, matching how the API stores
  // calendar dates; date-fns `parseISO` would read them as local time and shift the day.
  const date = typeof value === 'string' ? new Date(value) : value;
  return isValid(date) ? date : null;
}

/** Calendar dates are stored as UTC midnight; format them without timezone drift. */
function asCalendarDate(date: Date): Date {
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function formatDate(value: DateInput, pattern: string = appConfig.dateFormat): string {
  const date = toDate(value);
  return date ? format(asCalendarDate(date), pattern) : '—';
}

/** Compact calendar date for dense UI such as table cells. */
export function formatShortDate(value: DateInput): string {
  return formatDate(value, appConfig.shortDateFormat);
}

/** Whole days from today to the given calendar date (negative when in the past). */
export function daysFromToday(value: DateInput): number | null {
  const date = toDate(value);
  if (!date) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((asCalendarDate(date).getTime() - today.getTime()) / 86_400_000);
}

export function formatDateTime(value: DateInput): string {
  const date = toDate(value);
  return date ? format(date, `${appConfig.dateFormat}, HH:mm`) : '—';
}

export function timeAgo(value: DateInput): string {
  const date = toDate(value);
  return date ? `${formatDistanceToNowStrict(date)} ago` : '';
}

/** `YYYY-MM-DD` for <input type="date"> values. */
export function toInputDate(value: DateInput): string {
  const date = toDate(value);
  return date ? date.toISOString().slice(0, 10) : '';
}

export function todayInputDate(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())).toISOString().slice(0, 10);
}

export function isOverdue(due: DateInput, closed = false): boolean {
  const date = toDate(due);
  if (!date || closed) return false;
  const today = new Date();
  return asCalendarDate(date) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

export function formatMinutes(minutes: number | null | undefined): string {
  const total = Math.max(0, Math.round(minutes ?? 0));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export const minutesToHours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

/** Formats an amount in minor units (cents) for display, e.g. 9900 USD → "$99.00". */
export function formatMoney(amountCents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency}`;
  }
}

export function fullName(user?: { firstName: string; lastName: string } | null): string {
  return user ? `${user.firstName} ${user.lastName}`.trim() : '';
}

export function initials(user?: { firstName: string; lastName: string } | null): string {
  if (!user) return '?';
  return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
}

export function humanize(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Removes empty strings so optional form fields are not sent, and converts "" to null when clearing. */
export function compact<T extends Record<string, unknown>>(values: T, nullable: (keyof T)[] = []): Partial<T> {
  const result: Partial<T> = {};
  (Object.keys(values) as (keyof T)[]).forEach((key) => {
    const value = values[key];
    if (value === '' || value === undefined) {
      if (nullable.includes(key)) result[key] = null as T[keyof T];
      return;
    }
    result[key] = value;
  });
  return result;
}

/** Picks readable text color for a colored background. */
export function contrastText(hex: string): string {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111827' : '#ffffff';
}

/** Server text can carry `{{time:<ISO instant>}}`; shows it as a time in the reader's own time zone. */
export function localizeTimes(text: string): string {
  return text.replace(/\{\{time:([^}]+)\}\}/g, (token, iso: string) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? token : date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  });
}
