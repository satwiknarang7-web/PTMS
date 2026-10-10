import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { appConfig } from '@/shared/config/env';
import { AppShell } from '@/shared/components/app-shell';
import { routes } from '@/shared/config/routes';

export const metadata: Metadata = { title: { default: 'Platform', template: `%s · ${appConfig.name}` } };

/** Root-only platform console; AppShell redirects anyone else to their workspace. */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const refreshCookie = process.env.AUTH_REFRESH_COOKIE_NAME ?? 'sptms_rt';
  if (!cookieStore.has(refreshCookie)) {
    redirect(routes.login);
  }
  return <AppShell variant="platform">{children}</AppShell>;
}
