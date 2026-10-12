import { Suspense } from 'react';
import { MessagesView } from '@/features/messages/components/messages-view';
import { Spinner } from '@/shared/ui/feedback';

export default function MessagesPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <MessagesView />
    </Suspense>
  );
}
