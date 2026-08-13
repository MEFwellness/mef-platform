/**
 * Adaptive Coaching Direction, Part 3 — member_coaching_grades and the two
 * ledger columns migration 152 adds (comparison_outcome,
 * comparison_computed_at).
 *
 * Same discipline as every other data.ts here: pure functions taking a
 * caller-scoped SupabaseClient, RLS decides who may read or write what, and
 * a failed read returns a safe empty value rather than throwing, since
 * every caller is on a page render the member is already waiting on.
 *
 * WHY THE NEW LEDGER COLUMNS ARE READ HERE AND NOT IN ./data.ts.
 *
 * ./data.ts owns member_coaching_decisions and has a fixed column list that
 * Part 1's own render path selects on every load. Adding migration 152's
 * two columns to that list would make every Part 1 read fail with an
 * unknown-column error in the window between this code deploying and the
 * migration being applied, which would silently switch off outcome
 * resolution and the follow-on guardrail on the live site.
 *
 * So this module issues its own query, with its own column list, and its
 * own fail-closed behavior. Before the migration exists, every function
 * here reports "could not read" and the grading pass does nothing at all,
 * while Part 1 and Part 2 carry on byte-identically. That is what lets this
 * build ship dormant.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isCoachingActionType } from './types';
import type { CoachingActionType, MemberResponse } from './types';
import {
  isComparisonOutcome,
  isGradeEvidenceLevel,
  isGradeScope,
  isGradeVerdict,
} from './grading';
import type {
  CoachingGrade,
  ComparisonOutcome,
  GradeableDecision,
  GradeScope,
} from './grading';

// ---------------------------------------------------------------------
// Gradeable ledger rows
// ---------------------------------------------------------------------

const GRADEABLE_COLUMNS =
  'local_date, action_type, thread_key, member_response, comparison_reference_date, ' +
  'comparison_window_days, comparison_after_complete_on, comparison_outcome';

type GradeableRow = {
  local_date: string;
  action_type: string;
  thread_key: string;
  member_response: MemberResponse | null;
  comparison_reference_date: string;
  comparison_window_days: number;
  comparison_after_complete_on: string;
  comparison_outcome: string | null;
};

/**
 * One ledger row as the grading pass sees it: the grade's own view of it,
 * plus the three window parameters a comparison needs.
 */
export type LedgerRowForGrading = GradeableDecision & {
  comparisonReferenceDate: string;
  comparisonWindowDays: number;
  comparisonAfterCompleteOn: string;
};

/**
 * Every delivered decision in an inclusive local-date range, with its
 * cached comparison outcome.
 *
 * `ok` distinguishes "she has no decisions" from "the read did not work",
 * exactly as fetchWeeklyReview does and for the same reason: the caller's
 * response to the first is to grade an empty ledger (which writes neutral
 * grades), and to the second is to do nothing at all.
 */
export async function listLedgerRowsForGrading(
  supabase: SupabaseClient,
  memberId: string,
  fromLocalDate: string,
  toLocalDate: string
): Promise<{ ok: boolean; rows: LedgerRowForGrading[] }> {
  const { data, error } = await supabase
    .from('member_coaching_decisions')
    .select(GRADEABLE_COLUMNS)
    .eq('member_id', memberId)
    .gte('local_date', fromLocalDate)
    .lte('local_date', toLocalDate)
    .order('local_date', { ascending: true });

  if (error) {
    console.error('listLedgerRowsForGrading failed', error);
    return { ok: false, rows: [] };
  }

  const rows = ((data ?? []) as unknown as GradeableRow[]).map((row) => ({
    localDate: row.local_date,
    actionType: isCoachingActionType(row.action_type)
      ? (row.action_type as CoachingActionType)
      : ('reflection' as CoachingActionType),
    threadKey: row.thread_key,
    memberResponse: row.member_response,
    comparisonOutcome: isComparisonOutcome(row.comparison_outcome)
      ? (row.comparison_outcome as ComparisonOutcome)
      : null,
    comparisonReferenceDate: row.comparison_reference_date,
    comparisonWindowDays: row.comparison_window_days,
    comparisonAfterCompleteOn: row.comparison_after_complete_on,
  }));

  return { ok: true, rows };
}

/**
 * Caches one completed comparison on its own ledger row.
 *
 * Conditional on the outcome still being null, so the FIRST computed result
 * is the one that is kept. A completed window's numbers cannot change, so
 * there is nothing to gain from overwriting one and a concurrent second
 * render must not be able to.
 */
export async function recordComparisonOutcome(
  supabase: SupabaseClient,
  memberId: string,
  localDate: string,
  outcome: ComparisonOutcome
): Promise<boolean> {
  const { data, error } = await supabase
    .from('member_coaching_decisions')
    .update({
      comparison_outcome: outcome,
      comparison_computed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('member_id', memberId)
    .eq('local_date', localDate)
    .is('comparison_outcome', null)
    .select('id');

  if (error) {
    console.error('recordComparisonOutcome failed', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

// ---------------------------------------------------------------------
// Grades
// ---------------------------------------------------------------------

const GRADE_COLUMNS =
  'grade_scope, grade_key, action_type, delivered_count, acted_count, ignored_count, ' +
  'not_seen_count, compared_count, moved_count, verdict, evidence_level, span_days, ' +
  'last_delivered_local_date';

type GradeRow = {
  grade_scope: string;
  grade_key: string;
  action_type: string;
  delivered_count: number;
  acted_count: number;
  ignored_count: number;
  not_seen_count: number;
  compared_count: number;
  moved_count: number;
  verdict: string;
  evidence_level: string;
  span_days: number;
  last_delivered_local_date: string | null;
};

/**
 * A stored row, or null when it carries a slug this build does not
 * recognise.
 *
 * Refusing the row rather than coercing it is the same call
 * lib/weekly-review/data.ts makes for a plan it cannot sanitize: a grade
 * whose verdict came from a future build's wider vocabulary must not be
 * silently read as 'neutral', because a preference layer acting on a
 * misread verdict is worse than one acting on nothing.
 */
function fromGradeRow(row: GradeRow): CoachingGrade | null {
  if (!isGradeScope(row.grade_scope)) return null;
  if (!isCoachingActionType(row.action_type)) return null;
  if (!isGradeVerdict(row.verdict)) return null;
  if (!isGradeEvidenceLevel(row.evidence_level)) return null;

  return {
    scope: row.grade_scope as GradeScope,
    key: row.grade_key,
    actionType: row.action_type as CoachingActionType,
    deliveredCount: row.delivered_count,
    actedCount: row.acted_count,
    ignoredCount: row.ignored_count,
    notSeenCount: row.not_seen_count,
    comparedCount: row.compared_count,
    movedCount: row.moved_count,
    verdict: row.verdict,
    evidenceLevel: row.evidence_level,
    spanDays: row.span_days,
    lastDeliveredLocalDate: row.last_delivered_local_date,
  };
}

/**
 * Every grade this member has.
 *
 * Deliberately unbounded rather than paged, exactly like listCoachingThreads:
 * there are at most five action-type grades (the closed set) plus one per
 * thread Root has ever raised with her, which is small.
 *
 * Returns an empty array on any failure, which is what makes the daily
 * engine byte-identical to Part 1 before migration 152 lands.
 */
export async function listCoachingGrades(
  supabase: SupabaseClient,
  memberId: string
): Promise<CoachingGrade[]> {
  const { data, error } = await supabase
    .from('member_coaching_grades')
    .select(GRADE_COLUMNS)
    .eq('member_id', memberId);

  if (error || !data) {
    if (error) console.error('listCoachingGrades failed', error);
    return [];
  }
  return ((data ?? []) as unknown as GradeRow[])
    .map(fromGradeRow)
    .filter((grade): grade is CoachingGrade => grade !== null);
}

/**
 * The action-type grades, keyed by action type, which is the exact shape
 * the preference layer takes.
 *
 * Thread-scoped grades are deliberately excluded here rather than filtered
 * at the call site: ./preference.ts's own doc explains why a thread grade
 * must not reach the within-rung reorder, and the accessor enforcing it is
 * stronger than a comment asking callers to.
 */
export function actionTypeGradeMap(
  grades: readonly CoachingGrade[]
): Map<string, CoachingGrade> {
  return new Map(
    grades.filter((grade) => grade.scope === 'action_type').map((grade) => [grade.key, grade])
  );
}

/**
 * Writes a whole grading pass.
 *
 * An upsert on (member_id, grade_scope, grade_key), because a grade is a
 * current summary rather than an event: today's pass supersedes yesterday's
 * for the same scope, and there is nothing to keep from the old row.
 *
 * Returns false rather than throwing on any failure. A grading pass that
 * could not store its result is a pass that changes nothing, which is the
 * correct outcome for a layer that only ever makes a preference stronger.
 */
export async function upsertCoachingGrades(
  supabase: SupabaseClient,
  memberId: string,
  grades: readonly CoachingGrade[]
): Promise<boolean> {
  if (grades.length === 0) return true;

  const now = new Date().toISOString();
  const { error } = await supabase.from('member_coaching_grades').upsert(
    grades.map((grade) => ({
      member_id: memberId,
      grade_scope: grade.scope,
      grade_key: grade.key,
      action_type: grade.actionType,
      delivered_count: grade.deliveredCount,
      acted_count: grade.actedCount,
      ignored_count: grade.ignoredCount,
      not_seen_count: grade.notSeenCount,
      compared_count: grade.comparedCount,
      moved_count: grade.movedCount,
      verdict: grade.verdict,
      evidence_level: grade.evidenceLevel,
      span_days: grade.spanDays,
      last_delivered_local_date: grade.lastDeliveredLocalDate,
      computed_at: now,
      updated_at: now,
    })),
    { onConflict: 'member_id,grade_scope,grade_key' }
  );

  if (error) {
    console.error('upsertCoachingGrades failed', error);
    return false;
  }
  return true;
}
