'use server';

/**
 * The Coaching Brain's composition layer (Milestone 5) — the one place
 * that combines lib/brain/service.ts's content-agnostic Daily Decision
 * Object with today's actually-selected MefContentItem (lib/feed/) to
 * produce the full Daily Decision Object the milestone describes: Focus,
 * Reason, Coaching Mode, Challenge Level, Lesson, Action, Reflection
 * Prompt, Coach Insight, Encouragement, Risk Level, all in one place.
 *
 * This is the reusable entry point every coaching surface should call
 * instead of deciding coaching independently — today that's the Daily
 * page (getMyCoachingDecision) and the Coach Dashboard's client detail
 * page (getClientCoachingDecision); a future notification job, AI agent,
 * report, or chat surface calls the exact same functions.
 */

import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/supabase/currentUser';
import { resolveLocalDate } from './checkin';
import { getCoachingFocusDecision } from '@/lib/brain/service';
import { computeAdherence, buildAdaptiveNote } from '@/lib/feed/adaptiveDifficulty';
import { getOrCreateTodaysFeed } from '@/lib/feed/service';
import { getContentItem, listFeedHistory } from '@/lib/feed/data';
import type { CoachingFocusDecision } from '@/lib/brain/types';
import type { MefContentItem, DailyFeedItem } from '@mef/shared-types-contracts';

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

async function currentMemberLocalDate(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  timezoneOverride?: string
): Promise<string> {
  let timezone = timezoneOverride;
  if (!timezone) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('timezone')
      .eq('id', userId)
      .single();
    timezone = profile?.timezone ?? 'America/New_York';
  }
  return resolveLocalDate(
    new Date(new Date().toLocaleString('en-US', { timeZone: timezone })),
    false
  );
}

async function attachContent(
  supabase: ReturnType<typeof createClient>,
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
 * The signed-in member's own full Daily Decision Object. `timezone` is an
 * optional caller-supplied value (e.g. the Dashboard already fetched its
 * own profile row), passing it skips this function's own redundant
 * profiles query for the exact same row; omit it and behavior is
 * unchanged from before.
 */
export async function getMyCoachingDecision(timezone?: string): Promise<CoachingDecision | null> {
  const supabase = createClient();
  const user = await getCachedUser();
  if (!user) return null;

  const localDate = await currentMemberLocalDate(supabase, user.id, timezone);
  const decision = await getCoachingFocusDecision(supabase, user.id, localDate);
  return attachContent(supabase, user.id, localDate, decision);
}

/** A coach's read of a client's Daily Decision Object — RLS (the same policies lib/feed/service.ts and lib/narrative/data.ts already rely on) is what actually authorizes this; an unassigned clientId simply yields empty signals throughout. */
export async function getClientCoachingDecision(
  clientId: string
): Promise<CoachingDecision | null> {
  const supabase = createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('timezone')
    .eq('id', clientId)
    .maybeSingle();
  if (!profile) return null;

  const localDate = await resolveLocalDate(
    new Date(
      new Date().toLocaleString('en-US', { timeZone: profile.timezone ?? 'America/New_York' })
    ),
    false
  );
  const decision = await getCoachingFocusDecision(supabase, clientId, localDate);
  return attachContent(supabase, clientId, localDate, decision);
}
