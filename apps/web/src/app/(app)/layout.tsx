import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppShell } from '@/shared/components/app-shell';
import { routes } from '@/shared/config/routes';

export default async function AuthenticatedLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const refreshCookie = process.env.AUTH_REFRESH_COOKIE_NAME ?? 'sptms_rt';
  if (!cookieStore.has(refreshCookie)) {
    redirect(routes.login);
  }
  return <AppShell>{children}</AppShell>;
}
