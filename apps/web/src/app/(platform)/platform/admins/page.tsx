import type { Metadata } from 'next';
import { PlatformAdminsView } from '@/features/platform/components/platform-admins-view';

export const metadata: Metadata = { title: 'Root admins' };

export default function PlatformAdminsPage() {
  return <PlatformAdminsView />;
}
