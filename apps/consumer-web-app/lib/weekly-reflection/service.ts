/**
 * The one question every surface in this feature asks: what is this
 * member's Weekly Reflection state right now.
 *
 * Three answers, and only three:
 *
 *   null       not offered. She is not on the program tier, or it is
 *              Monday through Thursday. The pop-up chain, Home and the
 *              route all treat this identically, which is what makes the
 *              tier the whole gate rather than three gates that could
 *              drift.
 *   pending    offered, not finished. Carries the live recap.
 *   completed  finished this week. Carries the stored recap and answers.
 *
 * ONE COMPOSITION, ONE ANSWER. Home renders the pop-up chain and the
 * persistent card in the same pass, and the server action re-asks the same
 * question before it writes. ./view.ts memoizes this per request so all of
 * them are handed the identical object rather than each running its own
 * queries and each reaching its own conclusion.
 *
 * READS ONLY. Nothing in this path writes anything, including on the
 * render that produces the pop-up. See ./data.ts's header.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchMemberAccessFacts } from '../membership/service';
import { hasWeeklyReflectionAccess } from './access';
import {
  fetchWeeklyReflection,
  listCheckinDatesForRecap,
  listPatternStatesForRecap,
  type WeeklyReflectionRecord,
} from './data';
import { buildReflectionRecap, renderReflectionRecap, type RenderedRecap } from './recap';
import { reflectionWeekStartFor, recapRangeFor } from './week';
import { WEEKLY_REFLECTION_QUESTIONS_VERSION, type ReflectionAnswers } from './questions';

export type WeeklyReflectionState =
  | {
      status: 'pending';
      weekStart: string;
      range: { from: string; to: string };
      recap: RenderedRecap;
      questionsVersion: number;
    }
  | {
      status: 'completed';
      weekStart: string;
      range: { from: string; to: string };
      recap: RenderedRecap | null;
      answers: ReflectionAnswers | null;
      completedAt: string | null;
      questionsVersion: number;
    };

/**
 * Her state, or null when the experience is not offered at all.
 *
 * `localDate` is always her own, resolved from her stored profile timezone
 * on the server. The Friday-to-Sunday window is decided from that date and
 * nothing else, so a member in Auckland and a member in Los Angeles each
 * get their own Friday rather than the server's.
 */
export async function buildWeeklyReflectionState(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<WeeklyReflectionState | null> {
  const weekStart = reflectionWeekStartFor(localDate);
  if (!weekStart) return null;

  const facts = await fetchMemberAccessFacts(supabase, memberId);
  if (!hasWeeklyReflectionAccess(facts)) return null;

  const range = recapRangeFor(weekStart);

  const existing = await fetchWeeklyReflection(supabase, memberId, weekStart);
  // The read itself failed. Offer nothing rather than risk putting the
  // pop-up back in front of somebody who has already finished. See
  // fetchWeeklyReflection's own header.
  if (!existing.ok) return null;

  if (existing.record?.completedAt) {
    return completedStateFrom(existing.record, weekStart, range);
  }

  const [checkinLocalDates, patternStates] = await Promise.all([
    listCheckinDatesForRecap(supabase, memberId, weekStart),
    listPatternStatesForRecap(supabase, memberId),
  ]);

  return {
    status: 'pending',
    weekStart,
    range,
    recap: renderReflectionRecap(
      buildReflectionRecap({ weekStart, checkinLocalDates, patternStates })
    ),
    questionsVersion: WEEKLY_REFLECTION_QUESTIONS_VERSION,
  };
}

/** A finished week, rendered from what was stored rather than from what is true now, so she and her coach read the same seven days forever. */
export function completedStateFrom(
  record: WeeklyReflectionRecord,
  weekStart: string,
  range: { from: string; to: string }
): WeeklyReflectionState {
  return {
    status: 'completed',
    weekStart,
    range,
    recap: record.recap ? renderReflectionRecap(record.recap) : null,
    answers: record.answers,
    completedAt: record.completedAt,
    questionsVersion: record.questionsVersion,
  };
}
