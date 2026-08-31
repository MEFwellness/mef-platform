/**
 * The Coaching Brain's composition layer: lib/brain/service.ts's
 * content-agnostic Daily Decision Object, plus today's actually-selected
 * lesson, for ONE named member.
 *
 * WHY IT MOVED HERE (push notifications, part 2). This was private to
 * app/actions/coaching-brain.ts, whose own header already said "a future
 * notification job calls the exact same functions". That file is a
 * 'use server' module, so every export becomes a callable endpoint and no
 * export may take a SupabaseClient. The daily notification job runs under
 * the service role with no session at all, so it could not have called
 * anything in there. Rather than the job growing its own second copy of
 * "what is today's focus", the composition lives here, takes the client
 * and the member id explicitly, and has exactly three callers:
 *
 *   getMyCoachingDecision      the signed-in member's own surfaces
 *   getClientCoachingDecision  a coach reading a client
 *   the daily notification job (lib/push-decision/context.ts)
 *
 * The two server actions are now thin: resolve who and when, then call
 * this. Nothing about what they return changed.
 *
 * RLS IS STILL THE BOUNDARY. This function authorizes nothing. It reads
 * with whatever client it is handed, so a coach's client sees a coach's
 * rows and the job's service-role client sees everything, exactly as
 * before.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MefContentItem, DailyFeedItem } from '@mef/shared-types-contracts';
import { getCoachingFocusDecision } from './service';
import type { CoachingFocusDecision } from './types';
import { getOrCreateTodaysFeed } from '../feed/service';
import { getContentItem, listFeedHistory } from '../feed/data';
import { computeAdherence, buildAdaptiveNote } from '../feed/adaptiveDifficulty';

export type CoachingDecision = CoachingFocusDecision & {
  /** Today's real selected lesson, whichever content-selection path chose it (see lib/feed/selector.ts) — null only in the honest empty-library state. */
  content: MefContentItem | null;
  /** The persisted row backing `content` — needed by the UI for engagement state (completed_at/saved_at/etc.), never re-derived. */
  feedItem: DailyFeedItem | null;
  /** = content.suggested_action, surfaced under the milestone's own "Action" vocabulary. */
  action: string | null;
  /** = content.reflection_prompt, surfaced under the milestone's own "Reflection Prompt" vocabulary. */
  reflectionPrompt: string | null;
  /** A coach directly replaced today's content — the reason is always attributed to them, regardless of what the priority engine would otherwise say, mirroring lib/feed/selector.ts's own "coach assignment always wins" rule. */
  coachAssigned: boolean;
  /** Part 8's adaptive-difficulty note against today's actual selected lesson text — null exactly when lib/feed/adaptiveDifficulty.ts's buildAdaptiveNote would return null (typical adherence, or not enough history yet). */
  adaptiveNote: string | null;
};

export async function attachContent(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  decision: CoachingFocusDecision
): Promise<CoachingDecision> {
  const feedItem = await getOrCreateTodaysFeed(supabase, memberId, localDate);
  if (!feedItem) {
    return {
      ...decision,
      content: null,
      feedItem: null,
      action: null,
      reflectionPrompt: null,
      coachAssigned: false,
      adaptiveNote: null,
    };
  }

  const content: MefContentItem | null = await getContentItem(supabase, feedItem.content_item_id);
  const history = await listFeedHistory(supabase, memberId, 30);
  const adherence = computeAdherence(
    history.filter((item) => item.local_date < localDate).map((item) => ({ feedItem: item })),
    localDate
  );
  const adaptiveNote = content
    ? buildAdaptiveNote(content.suggested_action, adherence.level)
    : null;
  const coachAssigned = feedItem.coach_assigned_by !== null;

  return {
    ...decision,
    reason: coachAssigned ? 'coach_assignment' : decision.reason,
    reasonText: coachAssigned
      ? "Your coach chose today's focus for you directly."
      : decision.reasonText,
    content,
    feedItem,
    action: content?.suggested_action ?? null,
    reflectionPrompt: content?.reflection_prompt ?? null,
    coachAssigned,
    adaptiveNote,
  };
}

/**
 * One member's full Daily Decision Object for one local date. The whole
 * of what "today's focus" means in this product, in one call.
 */
export async function getFullCoachingDecision(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<CoachingDecision> {
  const decision = await getCoachingFocusDecision(supabase, memberId, localDate);
  return attachContent(supabase, memberId, localDate, decision);
}
