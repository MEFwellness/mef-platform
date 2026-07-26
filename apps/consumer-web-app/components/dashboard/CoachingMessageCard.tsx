/**
 * Root Coaching Conversation Engine — dashboard entry point (Prompt 13).
 * Self-fetching async server component, same shape as
 * RecommendationsCard.tsx/RootMapCard.tsx: its own data
 * (getMyCoachingMessage) streams in independently via the Suspense boundary
 * the dashboard wraps it in. Renders nothing when Root has nothing to say
 * today — never a forced or random message.
 *
 * Home dashboard redesign: now an image-backed carousel tile
 * (components/dashboard/NoticingTile.tsx). This card used to be a "tap to
 * reveal more" inline expand (CoachingMessageCardBody.tsx, now unused and
 * removed) — dashboardLine always visible, tapping "Tell me more" swapped
 * in the fuller coachingCard in place. There's no dedicated destination
 * page for this message, so the same reveal now happens in a bottom sheet
 * instead of inline, per the redesign's "inline expand -> sheet or
 * existing destination" rule. Headline is a <=6-word derivation
 * (lib/dashboard/toHeadline.ts) of dashboardLine; never new wording.
 */

import { getMyCoachingMessage } from '@/app/actions/rootCoaching';
import { NoticingTile } from './NoticingTile';
import { toHeadline } from '@/lib/dashboard/toHeadline';

export async function CoachingMessageCard() {
  const message = await getMyCoachingMessage();
  if (!message) return null;

  const hasMore = message.coachingCard.trim() !== message.dashboardLine.trim();

  return (
    <NoticingTile
      imageSrc="/images/card-fromroot.jpg"
      kicker="From Root"
      headline={toHeadline(message.dashboardLine)}
      sheetTitle="From Root"
    >
      <p className="text-[15px] leading-relaxed text-[#1B3A2D]">
        {hasMore ? message.coachingCard : message.dashboardLine}
      </p>
    </NoticingTile>
  );
}
