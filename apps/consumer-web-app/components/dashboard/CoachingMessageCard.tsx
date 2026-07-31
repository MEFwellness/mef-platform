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
 * existing destination" rule. The card-face headline is a fixed,
 * hand-written short label for this card, not derived from the day's
 * actual dashboardLine — that full dynamic message is exactly what the
 * sheet body below still shows.
 */

import type { Route } from 'next';
import { getMyCoachingMessage } from '@/app/actions/rootCoaching';
import { NoticingTile } from './NoticingTile';

const CVS_EXPERIMENT_CONVERSATION_TYPES = new Set(['cvs_day3_checkin', 'cvs_day7_result']);

export async function CoachingMessageCard() {
  const message = await getMyCoachingMessage();
  if (!message) return null;

  // Core Values Snapshot's Weekly Experiment follow-ups have a real
  // destination (the day-3/day-7 response happens there, not in a
  // read-only sheet) — same "href for a real page, sheet for dashboard-
  // only content" split this tile's own header comment describes.
  if (CVS_EXPERIMENT_CONVERSATION_TYPES.has(message.conversationType)) {
    return (
      <NoticingTile
        imageSrc="/images/card-fromroot.jpg"
        kicker="From Root"
        headline="Your five-minute experiment"
        href={'/assessments/core-values-snapshot/experiment' as Route}
      />
    );
  }

  const hasMore = message.coachingCard.trim() !== message.dashboardLine.trim();

  return (
    <NoticingTile
      imageSrc="/images/card-fromroot.jpg"
      kicker="From Root"
      headline="More context could help"
      sheetTitle="From Root"
    >
      <p className="text-[15px] leading-relaxed text-[#1B3A2D]">
        {hasMore ? message.coachingCard : message.dashboardLine}
      </p>
    </NoticingTile>
  );
}
