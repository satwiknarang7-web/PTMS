import type { Metadata } from 'next';
import { FeedbackInbox } from '@/features/feedback/components/feedback-inbox';

export const metadata: Metadata = { title: 'Feedback' };

export default function PlatformFeedbackPage() {
  return <FeedbackInbox />;
}
