/**
 * The one question every surface in this feature asks: what is this
 * member's Weekly Reflection state right now.
 *
 * Three answers, and only three:
 *
 *   null       not offered. Nothing opened this week for her: she is not
 *              on the program tier, or it is Monday through Thursday, and
 *              no coach has sent her this week's. The pop-up chain, Home
 *              and the route all treat this identically, which is what
 *              makes the offer one rule rather than three that could
 *              drift.
 *   pending    offered, not finished. Carries the live recap.
 *   completed  finished this week. Carries the stored recap and answers.
 *
 * TWO WAYS IN, ONE ANSWER. resolveWeeklyReflectionOffer below is where the
 * program tier's automatic Friday and a coach's assignment (migration 193)
 * meet, and it is the only place they meet. Every surface in the feature
 * reads its answer: this builder, the submit action and the delivery
 * receipt action all call it, so none of them can decide who is offered
 * what on its own.
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
import { hasWeeklyReflectionAccess, isWeeklyReflectionOffered } from './access';
import {
  fetchReflectionAssignment,
  fetchWeeklyReflection,
  listCheckinDatesForRecap,
  listPatternStatesForRecap,
  type WeeklyReflectionRecord,
} from './data';
import { buildReflectionRecap, renderReflectionRecap, type RenderedRecap } from './recap';
import {
  isReflectionWindowOpen,
  mostRecentReflectionWeekStart,
  recapRangeFor,
} from './week';
import { WEEKLY_REFLECTION_QUESTIONS_VERSION, type ReflectionAnswers } from './questions';

/**
 * Which of the two routes opened this week for her.
 *
 * It changes NOTHING about the experience: the same recap, the same five
 * questions, the same once-per-week row. It exists so the two sentences
 * that name a DEADLINE can be true. The program tier's window really does
 * close on Sunday night; an assigned week runs to the following Thursday,
 * so the assigned copy names no night at all rather than the wrong one.
 */
export type WeeklyReflectionOffer = 'program' | 'assigned';

export type WeeklyReflectionState =
  | {
      status: 'pending';
      offer: WeeklyReflectionOffer;
      weekStart: string;
      range: { from: string; to: string };
      recap: RenderedRecap;
      questionsVersion: number;
    }
  | {
      status: 'completed';
      offer: WeeklyReflectionOffer;
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
 * on the server. The window and the week are decided from that date and
 * nothing else, so a member in Auckland and a member in Los Angeles each
 * get their own Friday rather than the server's.
 *
 * Whether it is offered, and which week, is entirely
 * resolveWeeklyReflectionOffer's answer below. Everything after that line
 * is identical for a member who was offered it by her plan and a member
 * whose coach sent it: the same recap, the same five questions, the same
 * once-per-week row. There is no assigned variant of the experience.
 */
export async function buildWeeklyReflectionState(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<WeeklyReflectionState | null> {
  const offer = await resolveWeeklyReflectionOffer(supabase, memberId, localDate);
  if (!offer) return null;
  const { weekStart } = offer;
  // A program member inside her own window is on the program route even if
  // a coach also assigned her this week, because her Sunday night deadline
  // is real and is the more useful thing to tell her.
  const route: WeeklyReflectionOffer = offer.automatic ? 'program' : 'assigned';

  const range = recapRangeFor(weekStart);

  const existing = await fetchWeeklyReflection(supabase, memberId, weekStart);
  // The read itself failed. Offer nothing rather than risk putting the
  // pop-up back in front of somebody who has already finished. See
  // fetchWeeklyReflection's own header.
  if (!existing.ok) return null;

  if (existing.record?.completedAt) {
    return completedStateFrom(existing.record, weekStart, range, route);
  }

  const [checkinLocalDates, patternStates] = await Promise.all([
    listCheckinDatesForRecap(supabase, memberId, weekStart),
    listPatternStatesForRecap(supabase, memberId),
  ]);

  return {
    status: 'pending',
    offer: route,
    weekStart,
    range,
    recap: renderReflectionRecap(
      buildReflectionRecap({ weekStart, checkinLocalDates, patternStates })
    ),
    questionsVersion: WEEKLY_REFLECTION_QUESTIONS_VERSION,
  };
}

/**
 * Which week she is being offered, and by which of the two routes, or null
 * when nothing is open for her at all.
 *
 * ONE WEEK KEY FOR BOTH ROUTES. `mostRecentReflectionWeekStart` is the
 * Friday that BEGAN the seven day span the member is standing in, so on
 * Friday, Saturday and Sunday it is exactly the window's own Friday (the
 * identical value `reflectionWeekStartFor` returns) and on Monday through
 * Thursday it is the Friday that just passed. That single key is what
 * makes an assignment made on a Tuesday and a program member's automatic
 * Friday impossible to double up: they name the same week, so the
 * reflection row and the delivery receipt, both unique on
 * (member_id, week_start), each have exactly one row to be.
 *
 * IT EXPIRES BY ITSELF. An assignment belongs to one Friday and stops
 * applying the moment the next Friday opens a new span, with no expiry
 * column and no scheduler. A coach who sent one on Tuesday and whose
 * client never opened the app simply sends this week's again.
 *
 * TWO READS AT MOST, IN PARALLEL, AND ONE ON MOST DAYS. The tier is only
 * consulted when her window is actually open, because outside it the
 * automatic route cannot produce an offer whatever her plan says. So
 * Monday through Thursday this costs one indexed lookup on a table that is
 * empty for almost every member, and Friday through Sunday it costs the
 * subscription read it always cost plus that lookup beside it.
 *
 * FAILS SHUT on both sides. A failed assignment read is not an assignment
 * and a failed tier read is not access, which is the same direction
 * ./access.ts takes and for the same reason: the cost of being wrong this
 * way is one member who does not get her pop-up until the read works
 * again.
 */
export async function resolveWeeklyReflectionOffer(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string
): Promise<{ weekStart: string; automatic: boolean; assigned: boolean } | null> {
  const weekStart = mostRecentReflectionWeekStart(localDate);
  const windowOpen = isReflectionWindowOpen(localDate);

  const [facts, assignment] = await Promise.all([
    windowOpen ? fetchMemberAccessFacts(supabase, memberId) : Promise.resolve(null),
    fetchReflectionAssignment(supabase, memberId, weekStart),
  ]);

  const assigned = assignment.ok && assignment.record !== null;
  if (!isWeeklyReflectionOffered({ facts, windowOpen, assigned })) return null;

  return { weekStart, automatic: windowOpen && hasWeeklyReflectionAccess(facts), assigned };
}

/** A finished week, rendered from what was stored rather than from what is true now, so she and her coach read the same seven days forever. */
export function completedStateFrom(
  record: WeeklyReflectionRecord,
  weekStart: string,
  range: { from: string; to: string },
  offer: WeeklyReflectionOffer = 'program'
): WeeklyReflectionState {
  return {
    status: 'completed',
    offer,
    weekStart,
    range,
    recap: record.recap ? renderReflectionRecap(record.recap) : null,
    answers: record.answers,
    completedAt: record.completedAt,
    questionsVersion: record.questionsVersion,
  };
}
