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
 *
 * Core Values Snapshot's day-3/day-7 Weekly Experiment follow-ups win this
 * engine's top daily slot almost every time they're eligible (priority
 * 90/94), but they're deliberately never rendered here: the real
 * question/reflection, with a real answer/acknowledge affordance, now
 * lives directly on the dashboard as its own card
 * (components/dashboard/ActiveExperimentsSection.tsx) instead
 * of a teaser tile that only links out to it — showing it a second time
 * here would just be the same "From Root" message twice on one screen.
 * getMyCoachingMessage() still runs and still records the pick into
 * member_coaching_messages (needed for this engine's own de-dup/history
 * bookkeeping); this card just renders nothing for those conversation
 * types.
 */

import { getMyCoachingMessage } from '@/app/actions/rootCoaching';
import { NoticingTile } from './NoticingTile';

const EXPERIMENT_FOLLOW_UP_CONVERSATION_TYPES = new Set([
  'cvs_day3_checkin',
  'cvs_day7_result',
  'lsc_day3_checkin',
  'lsc_day7_result',
]);

export async function CoachingMessageCard() {
  const message = await getMyCoachingMessage();
  if (!message) return null;
  if (EXPERIMENT_FOLLOW_UP_CONVERSATION_TYPES.has(message.conversationType)) return null;

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
