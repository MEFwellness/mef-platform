/**
 * Adaptive Coaching Direction, Part 3 — the grading pass.
 *
 * Three jobs, and none of them is deciding anything. The math is the pure
 * function in ./grading.ts; this file supplies it with the ledger, fills in
 * the comparisons that have finished elapsing, and stores the result.
 *
 *   1. Read the ledger for the lookback window.
 *   2. For acted-on decisions whose after window is complete and whose
 *      outcome has not been computed yet, call the existing before/after
 *      comparison primitive once each and CACHE the answer on the row.
 *   3. Grade every action type and every thread, and write the grades.
 *
 * NO CRON, AND DELIBERATELY SO, exactly as Parts 1 and 2 decided. The
 * triggers are the two moments the ledger genuinely changes shape: a
 * completed check-in (which is also the event most likely to have moved a
 * comparison window past its completion date) and the weekly review's own
 * composition path (which is about to read the grades anyway). A scheduled
 * job would have to guess every member's timezone and would grade members
 * who never came back.
 *
 * IT MUST BE CHEAP, and the two things that make it cheap are both here:
 * a comparison is computed at most once ever per decision, and at most
 * MAX_COMPARISONS_PER_PASS of them run in one pass. Everything else is one
 * SELECT, arithmetic in memory, and one UPSERT.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getMemberWindowComparison } from '../analytics-service/comparison';
import { trackProductEvent } from '../analytics/track';
import { shiftLocalDate } from './data';
import {
  GRADE_LOOKBACK_DAYS,
  gradeDecisions,
  readComparison,
} from './grading';
import type { CoachingGrade, GradeableDecision } from './grading';
import {
  listCoachingGrades,
  listLedgerRowsForGrading,
  recordComparisonOutcome,
  upsertCoachingGrades,
} from './gradesData';
import type { LedgerRowForGrading } from './gradesData';
import { coachingServiceRoleClient } from './serviceRole';
import type { CoachingActionType } from './types';

/**
 * How many before/after comparisons one pass may run.
 *
 * Each is a single RPC against an already-indexed event table, but they are
 * the only thing in this pass that is not free, and a member returning
 * after two months away could otherwise have thirty of them come due at
 * once on the render she comes back on. The uncomputed ones are not lost:
 * they have no outcome yet, so the next pass picks them up. Oldest first,
 * so nothing can be starved.
 */
export const MAX_COMPARISONS_PER_PASS = 6;

export type GradingPassResult = {
  /** False when the ledger could not be read at all, which is the pre-migration state. */
  ok: boolean;
  grades: CoachingGrade[];
  comparisonsComputed: number;
};

/**
 * Which ledger rows are worth spending a comparison on.
 *
 * Three conditions, and the first is the one worth explaining. Only
 * ACTED-ON decisions are compared, because the question a comparison
 * answers is "did anything change after she did this", and a decision she
 * never acted on has no "after she did this". Spending an RPC to measure
 * the fortnight following something that did not happen would produce a
 * number that means nothing, and the grader would then be at risk of
 * reading it as though it did.
 */
export function comparisonCandidates(
  rows: readonly LedgerRowForGrading[],
  todayLocalDate: string
): LedgerRowForGrading[] {
  return rows
    .filter((row) => row.memberResponse === 'done' || row.memberResponse === 'help')
    .filter((row) => row.comparisonOutcome === null)
    .filter((row) => row.comparisonAfterCompleteOn <= todayLocalDate)
    .slice(0, MAX_COMPARISONS_PER_PASS);
}

/**
 * Groups the ledger into the two graded scopes.
 *
 * An action type with no decisions gets NO grade rather than a zeroed one.
 * A grade that has never been delivered is not evidence that it does not
 * work, and writing a neutral row for all five types on every pass would
 * fill the table with rows saying nothing.
 */
export function groupForGrading(rows: readonly GradeableDecision[]): CoachingGrade[] {
  const byActionType = new Map<CoachingActionType, GradeableDecision[]>();
  const byThread = new Map<string, GradeableDecision[]>();

  for (const row of rows) {
    const forType = byActionType.get(row.actionType) ?? [];
    forType.push(row);
    byActionType.set(row.actionType, forType);

    const forThread = byThread.get(row.threadKey) ?? [];
    forThread.push(row);
    byThread.set(row.threadKey, forThread);
  }

  const grades: CoachingGrade[] = [];
  for (const [actionType, decisions] of byActionType) {
    grades.push(gradeDecisions('action_type', actionType, actionType, decisions));
  }
  for (const [threadKey, decisions] of byThread) {
    // Every decision on one thread shares that thread's action type, so
    // reading it off the first is exact rather than a sample.
    const actionType = decisions[0]!.actionType;
    grades.push(gradeDecisions('thread', threadKey, actionType, decisions));
  }
  return grades;
}

/**
 * The whole pass. Never throws: every caller is a side effect on a path the
 * member is already waiting on.
 *
 * Returns `ok: false` and does nothing at all when the ledger read fails,
 * which is the state between this code deploying and migration 152 being
 * applied. In that state the daily engine reads no grades, the weekly
 * review says nothing about grades, and the app is byte-identical to Part 2.
 */
export async function recomputeCoachingGrades(
  supabase: SupabaseClient,
  memberId: string,
  todayLocalDate: string,
  timezone: string
): Promise<GradingPassResult> {
  try {
    const from = shiftLocalDate(todayLocalDate, -GRADE_LOOKBACK_DAYS);
    const { ok, rows } = await listLedgerRowsForGrading(supabase, memberId, from, todayLocalDate);
    if (!ok) return { ok: false, grades: [], comparisonsComputed: 0 };

    // Fill in the comparisons that have come due since the last pass.
    // Outcomes are written back into the in-memory rows as well as to the
    // database, so this pass grades on what it just learned rather than on
    // what it read a moment ago.
    let comparisonsComputed = 0;
    const analytics = coachingServiceRoleClient();
    if (analytics) {
      for (const row of comparisonCandidates(rows, todayLocalDate)) {
        try {
          const comparison = await getMemberWindowComparison(
            analytics,
            memberId,
            row.comparisonReferenceDate,
            {
              windowDays: row.comparisonWindowDays,
              // Deliberately true, for the same reason Part 1's friction
              // read sets it: that flag exists so a dashboard's numbers are
              // not polluted by staff accounts, and here it would silently
              // switch grading off for exactly the accounts this feature is
              // verified on.
              includeTestAccounts: true,
            }
          );
          const outcome = readComparison(comparison);
          // Null means the after window has not finished elapsing after all.
          // Nothing is recorded, and the row is picked up again next pass.
          if (!outcome) continue;

          await recordComparisonOutcome(supabase, memberId, row.localDate, outcome);
          row.comparisonOutcome = outcome;
          comparisonsComputed += 1;
        } catch (error) {
          // Best effort, exactly like every other analytics read in this
          // feature. A comparison that could not run means one less graded
          // decision, never a failed pass.
          console.error('grading comparison failed', error);
        }
      }
    }

    const grades = groupForGrading(rows);
    await upsertCoachingGrades(supabase, memberId, grades);

    // Counts only. See lib/analytics/track.ts's allowlist: there is no
    // payload field a thread key, an action type's evidence, or anything
    // about her could travel in on this event.
    await trackProductEvent(supabase, {
      memberId,
      eventType: 'coaching_grades_computed',
      timezone,
      payload: {
        gradeCount: countValue(grades.length),
        landingCount: countValue(grades.filter((g) => g.verdict === 'landing').length),
        deadCount: countValue(grades.filter((g) => g.verdict === 'dead').length),
      },
    });

    return { ok: true, grades, comparisonsComputed };
  } catch (error) {
    console.error('recomputeCoachingGrades failed', error);
    return { ok: false, grades: [], comparisonsComputed: 0 };
  }
}

/**
 * A count, as the digit string an analytics payload can carry.
 *
 * The analytics payload is a map of short slugs and its sanitizer keeps
 * strings only, which is the rule that makes a sentence unable to reach an
 * event row. Rather than widen that rule for three numbers, a count is
 * written as its own digits: still bounded, still unable to hold prose, and
 * the sanitizer's contract is untouched. Clamped and truncated so a
 * negative or fractional count cannot produce a non-numeric string.
 */
export function countValue(count: number): string {
  if (!Number.isFinite(count)) return '0';
  return String(Math.max(0, Math.trunc(count)));
}

/**
 * The grades as the daily engine and the weekly review read them.
 *
 * A thin convenience over ./gradesData.ts's own accessor, kept here so
 * every consumer of grades goes through this module rather than reaching
 * into the table's own layer.
 */
export async function loadCoachingGrades(
  supabase: SupabaseClient,
  memberId: string
): Promise<CoachingGrade[]> {
  return listCoachingGrades(supabase, memberId);
}
