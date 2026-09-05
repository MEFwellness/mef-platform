/**
 * ONE KNOCK PER SITTING.
 *
 * WHAT WAS HAPPENING. A member finished Core Values Snapshot, read its
 * closing screen, which invites her on to the Readiness path, tapped Home,
 * and was immediately met with a pop-up offering Life Signal Check. Two
 * invitations to start something new inside about a minute, the second one
 * interrupting her before she had put the first one down. Nothing was
 * broken: every branch of the chain was correct on its own, and together
 * they read as an app that will not let her finish anything.
 *
 * THE RULE. When she has completed an experience today, in her own local
 * day, a pop-up that OFFERS the next experience does not fire until
 * tomorrow. The closing screen's own invitation is untouched and still
 * immediate, so a member who wants to keep going keeps going, by choice,
 * on the screen where she just finished. What she does not get is Root
 * knocking again on the way past.
 *
 * WHAT IS DELAYED, AND IT IS EXACTLY FOUR KINDS. The three "start the
 * weekly experiment" offers and the free arc invitation. Every one of them
 * is an invitation to BEGIN something, every one of them has a permanent
 * home on Home as a card, and every one of them is still there tomorrow.
 * Nothing is lost by waiting a day and nothing is dismissed on her behalf:
 * a hushed branch falls through with no dismissal row written, so the offer
 * is genuinely still due on her next local day.
 *
 * WHAT IS NEVER DELAYED, AND WHY EACH ONE. A coach assignment, because it
 * is a person asking her directly. The Priority Card, because Root's
 * strongest override in it is an unresolved safety flag. The trial arc's
 * day messages, the arrival greeting and the day 6 and day 7 milestones,
 * because the arc already says at most one thing per member per day and
 * hushing it would silence a day of a seven day sequence outright. The
 * day 3 and day 7 follow-ups of anything already running, because
 * continuing is not a new invitation. tests/root-popup-one-knock.test.ts
 * holds all of that as a list with no exceptions.
 *
 * NO NEW STATE. There is no "offered today" column and no new table. The
 * question is answered from the completion rows themselves: her own
 * finished sessions for the three free arc experiences, each one turned
 * into the local date SHE finished it on, through lib/time/localDate.ts,
 * against the local date she is living in now, through
 * lib/time/memberToday.ts. If the completion is real, the hush is real.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { localDateStringFor } from '@/lib/time/localDate';
import { memberTimezone, memberTodayLocalDate } from '@/lib/time/memberToday';
import { getUnifiedAssessmentDefinitionByKey } from '@/lib/assessment-foundation/repository';
import { FREE_ARC_SEQUENCE } from './freeArc';

/**
 * The pop-up kinds this rule delays. Exported as data so the guard test
 * can assert the complement (every other kind in the chain) is untouched,
 * rather than trusting a list written twice.
 */
export const EXPERIENCE_OFFER_POPUP_KINDS: readonly string[] = [
  'cvs_offer',
  'lsc_offer',
  'rpl_offer',
  'free_arc_available',
];

/**
 * The kinds that must never be delayed by this rule, whatever else is true
 * of her day. Coach assignments, safety, the arc, the arrival, and every
 * follow-up for something already running.
 */
export const PROTECTED_POPUP_KINDS: readonly string[] = [
  'public_entry_welcome',
  'trial_arc_day',
  'questionnaire_assigned',
  'stress_load_assigned',
  'priority_card',
  'hydration_focus',
  'cvs_day3',
  'cvs_day7',
  'lsc_day3',
  'lsc_day7',
  'rpl_day3',
  'rpl_day7',
  'reset_plan_day3',
  'reset_plan_day7',
  'weekly_reflection',
  'weekly_review',
];

export function isExperienceOfferPopupKind(kind: string): boolean {
  return EXPERIENCE_OFFER_POPUP_KINDS.includes(kind);
}

/**
 * How far back to look for completions before deciding.
 *
 * Two days rather than one, because "her local day" can begin up to a day
 * either side of the server's, and this is a filter on the query rather
 * than the decision: every row it returns is still turned into her own
 * local date and compared exactly. Bounding it at all is only so this
 * never walks a long history to answer a question about today.
 */
export const ONE_KNOCK_LOOKBACK_HOURS = 48;

/** How many recent completions to read. More than anybody finishes in two days. */
const ROW_LIMIT = 20;

/**
 * Did she finish one of the free arc experiences today, in her own local
 * day?
 *
 * FALSE ON ANY DOUBT. A failed read, a missing definition or a row with no
 * completion instant all answer false, because the cost of being wrong in
 * that direction is one extra invitation and the cost of being wrong the
 * other way is silencing a message she was owed.
 */
export async function completedAnExperienceToday(
  supabase: SupabaseClient,
  memberId: string
): Promise<boolean> {
  try {
    const definitions = await Promise.all(
      FREE_ARC_SEQUENCE.map((key) => getUnifiedAssessmentDefinitionByKey(supabase, key))
    );
    const definitionIds = definitions
      .filter((d): d is NonNullable<typeof d> => Boolean(d?.id))
      .map((d) => d.id);
    if (definitionIds.length === 0) return false;

    const since = new Date(Date.now() - ONE_KNOCK_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('unified_assessment_sessions')
      .select('completed_at')
      .eq('member_id', memberId)
      .eq('status', 'completed')
      .in('assessment_definition_id', definitionIds)
      .gte('completed_at', since)
      .order('completed_at', { ascending: false })
      .limit(ROW_LIMIT);
    if (error || !data || data.length === 0) return false;

    const [timezone, today] = await Promise.all([
      memberTimezone(supabase, memberId),
      memberTodayLocalDate(supabase, memberId),
    ]);

    return data.some((row) => {
      const completedAt = (row as { completed_at: string | null }).completed_at;
      if (!completedAt) return false;
      return localDateStringFor(completedAt, timezone) === today;
    });
  } catch (err) {
    console.error('completedAnExperienceToday failed', err);
    return false;
  }
}
