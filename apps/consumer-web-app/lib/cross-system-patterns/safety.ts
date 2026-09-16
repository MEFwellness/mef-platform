/**
 * THE SAFETY OVERRIDE. The existing red flag system always wins.
 *
 * WHAT THIS FILE IS NOT. It is not a second safety system, it defines no
 * flag, it decides nothing about urgency and it reads no keyword. The
 * Rooted Reset Body Systems Survey's own red flag layer
 * (lib/body-systems/redFlags.ts, migration 221) is the only thing that
 * decides a response carries a safety response, and this file asks it.
 * `firedRedFlags` is imported rather than reimplemented, so a flag added
 * to that layer next year is honoured here on the day it is added.
 *
 * WHY A SITTING AND NOT AN ANSWER. A red flag on the Body Systems Survey
 * is answered on its own screens, in its own column, alongside a whole
 * sitting: she says Yes to "have you had unexplained weight loss" while
 * answering the same eleven sections every other signal from that sitting
 * came out of. There is no per question link between one flag and one
 * section answer, and inventing one would be a clinical judgement this
 * feature is not allowed to make. So the rule is the wide one, which is
 * the safe direction: EVERY signal captured from a sitting that fired a
 * red flag is treated as carrying a safety response.
 *
 * AND THE SUPPRESSION IS WIDER STILL. One contributing signal is enough to
 * withhold the entire card, primary or supporting, because the brief's
 * rule is about the card and not about the row: a coach reading four
 * neatly separated blocks about a whole-body pattern is reading an
 * explanation, and an explanation must never be the thing in front of a
 * response that needs the safety process instead.
 */

import { firedRedFlags } from '@/lib/body-systems/redFlags';
import type {
  BodySystemsRedFlag,
  BodySystemsRedFlagAnswers,
  BodySystemsSafetyLevel,
} from '@/lib/body-systems/types';
import type { SignalRecord } from '@/lib/cross-system-signals/types';
import { SOURCE_BODY_SYSTEMS } from '@/lib/cross-system-signals/constants';

/** One finished sitting, as the override needs to see it. */
export type FlaggableSitting = {
  sittingId: string;
  redFlagAnswers: BodySystemsRedFlagAnswers;
};

/**
 * The sittings that fired at least one red flag.
 *
 * Delegates the whole decision to the survey's own layer. A stored answer
 * that is not a literal `true`, a flag key nobody has and an unanswered
 * flag all read as No there, which is the direction that never invents a
 * safety event that did not happen.
 */
export function flaggedSittingIds(
  sittings: readonly FlaggableSitting[],
  flags: readonly BodySystemsRedFlag[],
  levels: readonly BodySystemsSafetyLevel[]
): Set<string> {
  const out = new Set<string>();
  for (const sitting of sittings) {
    if (firedRedFlags(flags, levels, sitting.redFlagAnswers).length > 0) {
      out.add(sitting.sittingId);
    }
  }
  return out;
}

/**
 * The stored signal rows that came out of a flagged sitting.
 *
 * Scoped to the Body Systems Survey by source key as well as by session
 * id, so a sitting id from another instrument that happened to collide
 * could not silently flag a row that has nothing to do with it.
 */
export function redFlaggedSignalIds(
  records: readonly SignalRecord[],
  flaggedSittings: ReadonlySet<string>
): Set<string> {
  const out = new Set<string>();
  if (flaggedSittings.size === 0) return out;
  for (const record of records) {
    if (record.sourceKey !== SOURCE_BODY_SYSTEMS) continue;
    if (record.sourceSessionId === null) continue;
    if (flaggedSittings.has(record.sourceSessionId)) out.add(record.id);
  }
  return out;
}
