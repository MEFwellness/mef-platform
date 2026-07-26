/**
 * Client-side eligibility for "local follow-up" driver_probe_questions
 * rows (driver_id null — e.g. checkin_probe.what_kept_you_up,
 * checkin_probe.crash_timing) — the same role
 * lib/adaptive-assessment-engine/select.ts's isEligible() plays
 * server-side, but evaluated against answers the member has *just*
 * entered in this check-in (which the server-side plan, computed before
 * any answer exists for today, can never see). Reuses that engine's own
 * exported `ruleSatisfied` rather than re-implementing Rule semantics.
 *
 * Generalizes the pattern migration 106 introduced for
 * pain_location/pain_aggravating_factor (hand-coded threshold checks in
 * CheckinForm.tsx) to any row with a non-empty `requires`/`excludes`,
 * which is what makes adding a new same-day follow-up (migration 109)
 * a data change instead of a new bespoke JSX block.
 */

import { ruleSatisfied } from '../adaptive-assessment-engine/select';
import type { AnsweredMap } from '../adaptive-assessment-engine/types';
import type { DriverProbeQuestion } from './types';

/** True if every `requires` rule holds and no `excludes` rule holds, against answers entered so far in the current, in-progress check-in. Absent/empty `requires` = always eligible once its parent conditions (if any) don't exclude it. */
export function isLocalFollowUpEligible(
  question: DriverProbeQuestion,
  answeredSoFar: AnsweredMap
): boolean {
  if (question.requires.length > 0 && !question.requires.every((rule) => ruleSatisfied(rule, answeredSoFar))) {
    return false;
  }
  if (question.excludes.some((rule) => ruleSatisfied(rule, answeredSoFar))) {
    return false;
  }
  return true;
}

/** Every local-follow-up row (driver_id null) belonging to a given screen, in the order they were returned. */
export function localFollowUpsForScreen(
  questions: readonly DriverProbeQuestion[],
  screen: DriverProbeQuestion['screen']
): DriverProbeQuestion[] {
  return questions.filter((q) => q.driverId === null && q.screen === screen);
}
