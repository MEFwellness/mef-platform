/**
 * Adaptive Coaching Direction, Part 3 — the per-member preference layer.
 *
 * WHAT THIS IS ALLOWED TO DO, stated precisely, because it is the easiest
 * thing in this build to over-read.
 *
 * When a rung of the Part 1 ladder produces MORE THAN ONE candidate, this
 * prefers the kind of action this member has evidence of acting on, and
 * puts the kinds graded dead for her last. That is all. It is the same
 * shape as the Part 2 week focus's own reorder
 * (lib/weekly-review/focus.ts), for the same reasons, and with the same two
 * directly testable properties:
 *
 *   1. The sequence of RULES in the returned array is byte-identical to the
 *      input's. Only the order of candidates that share a rule can change.
 *      A grade can therefore never promote a candidate past one on a higher
 *      rung, and the hierarchy order itself is untouched.
 *   2. With no grades, the returned array is byte-identical to the input.
 *      An ungraded member's engine is the Part 1 engine exactly.
 *
 * WHAT THIS MAY NEVER DO.
 *   - Remove a candidate. A dead grade DEPRIORITIZES; it never deletes. A
 *     rung whose only candidate is dead-graded still produces that
 *     candidate, because the alternative is Root having nothing to say. The
 *     21 day decay in ./grading.ts is what stops that being permanent.
 *   - Reach safety, re-engagement or a commitment she agreed to. Those
 *     three are exempt structurally, by reusing the Part 2 exemption list
 *     rather than restating it, so the two preference layers in this
 *     product can never drift apart about which rules are off limits.
 *   - Create a candidate, or resurrect a rule whose inputs are absent.
 *   - See any health data. It reads an action type slug and a verdict slug.
 */

import { isFocusExemptRule } from '../weekly-review/focus';
import type { PriorityRule } from '../priority/types';
import { effectiveVerdict } from './grading';
import type { CoachingGrade, GradeEvidenceLevel } from './grading';
import type { CoachingActionType } from './types';

/**
 * The minimum evidence a grade needs before it may reorder anything.
 *
 * Thin evidence is labelled thin everywhere in this build and is acted on
 * nowhere. A single acted-on morning must not be able to decide which of
 * two equally-ranked candidates a member sees for the rest of the month.
 */
export const MIN_EVIDENCE_TO_PREFER: GradeEvidenceLevel = 'moderate';

export function isActionableGradeEvidence(level: GradeEvidenceLevel): boolean {
  return level !== 'thin';
}

/**
 * Where a candidate sits in the partition. Lower sorts first.
 *
 *   0  its action type is landing for her
 *   1  everything else, including landed-but-flat, neutral, ungraded, and
 *      any grade too thin to act on
 *   2  its action type is dead for her
 *
 * 'landed_no_change' deliberately sits in the middle rather than with
 * 'landing'. She takes it up and nothing has moved yet; that is a reason to
 * keep offering it, not a reason to prefer it over something that has
 * demonstrably changed her week.
 */
export function preferenceBand(
  actionType: CoachingActionType,
  grades: ReadonlyMap<string, CoachingGrade>,
  todayLocalDate: string
): 0 | 1 | 2 {
  const grade = grades.get(actionType);
  if (!grade) return 1;
  if (!isActionableGradeEvidence(grade.evidenceLevel)) return 1;

  // Decay is applied here, which is what makes a dead grade temporary
  // without any job having to run: 21 days after the last delivery of that
  // type, this reads 'neutral' and the candidate returns to the middle
  // band, so Root can carefully try it again.
  const verdict = effectiveVerdict(grade, todayLocalDate);
  if (verdict === 'landing') return 0;
  if (verdict === 'dead') return 2;
  return 1;
}

/**
 * The reorder itself: a stable three-way partition inside each rung group,
 * applied to the ladder in place order.
 *
 * `Array.prototype.sort` is deliberately not used, for the same reason
 * lib/weekly-review/focus.ts avoids it: a stable partition is easier to
 * reason about than a comparator, and it guarantees candidates in the same
 * band keep the source's own order, which is the hierarchy's existing
 * tie-break and must survive.
 *
 * `grades` is keyed by ACTION TYPE (the 'action_type' scope of
 * member_coaching_grades). Thread-scoped grades exist and are read by the
 * weekly review and the coach surface; they deliberately do not reach this
 * function, because the thing a rung offers a choice between is a kind of
 * action, and preferring one specific thread over another would be a second
 * hierarchy rather than a preference inside this one.
 */
export function preferGradedActionTypesWithinRung<
  T extends { rule: PriorityRule; threadKey: string; actionType: CoachingActionType },
>(
  candidates: readonly T[],
  grades: ReadonlyMap<string, CoachingGrade>,
  todayLocalDate: string
): T[] {
  if (grades.size === 0) return [...candidates];

  const out: T[] = [];
  let index = 0;
  while (index < candidates.length) {
    const rule = candidates[index]!.rule;
    let end = index;
    while (end < candidates.length && candidates[end]!.rule === rule) end += 1;

    const group = candidates.slice(index, end);
    // A single candidate is not a choice, and an exempt rung is not this
    // layer's to touch. Both are returned untouched rather than partitioned
    // into a one-element band, so the no-op case is a property of the data.
    if (group.length <= 1 || isFocusExemptRule(rule)) {
      out.push(...group);
    } else {
      for (const band of [0, 1, 2] as const) {
        for (const candidate of group) {
          if (preferenceBand(candidate.actionType, grades, todayLocalDate) === band) {
            out.push(candidate);
          }
        }
      }
    }
    index = end;
  }
  return out;
}
