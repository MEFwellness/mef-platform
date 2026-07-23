/**
 * Root Coaching Conversation Engine — dashboard entry point (Prompt 13).
 * Self-fetching async server component, same shape as
 * RecommendationsCard.tsx/RootMapCard.tsx: its own data
 * (getMyCoachingMessage) streams in independently via the Suspense boundary
 * the dashboard wraps it in. Renders nothing when Root has nothing to say
 * today — never a forced or random message.
 */

import { Sparkles } from 'lucide-react';
import { getMyCoachingMessage } from '@/app/actions/rootCoaching';
import { CoachingMessageCardBody } from './CoachingMessageCardBody';

const CARD = 'rounded-[28px] bg-white shadow-[0_2px_24px_-4px_rgba(27,58,45,0.10)]';

export async function CoachingMessageCard() {
  const message = await getMyCoachingMessage();
  if (!message) return null;

  return (
    <section className={`${CARD} p-6`}>
      <div className="flex items-center gap-2 text-[#6B7A72]">
        <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-sm font-semibold uppercase tracking-wider">From Root</p>
      </div>
      <CoachingMessageCardBody dashboardLine={message.dashboardLine} coachingCard={message.coachingCard} />
    </section>
  );
}
