/**
 * Assembling one visitor's result from one visitor's answers.
 *
 * Pure, synchronous and deterministic. The same nine answers always produce
 * the same result, on the server and in the browser, which is what makes
 * this testable and what makes "built from your answers" an assertion
 * rather than a marketing line.
 *
 * WHAT THE FREE RESULT CONTAINS. Everything except the three day notes: the
 * pattern, the evidence, what it often looks like, what it does not tell
 * us, and one thing worth trying. The email step comes AFTER all of that is
 * already on screen, and buildThreeDayNotes is a separate function for
 * exactly that reason. A result with no email on it is not a partial
 * result.
 */

import type { PublicEntryPatternKey } from '@mef/shared-types-contracts';
import { ANSWER_ECHOES, ENERGY_PATTERN_COPY, RESULT_UNIVERSAL_LIMITS } from './copy';
import { resolveEnergyPattern } from './patterns';
import { isComplete, type EnergyAnswers } from './questions';

export type EnergyEvidenceLine = {
  /** Which question this line restates, so a reader (and a test) can trace it back. */
  readonly questionKey: string;
  /** The stored option value it restates. */
  readonly answerValue: string;
  /** The full sentence shown, always a restatement and never an inference. */
  readonly text: string;
};

export type EnergyResult = {
  readonly patternKey: PublicEntryPatternKey;
  readonly title: string;
  readonly summary: string;
  /** False when no rule fired and the honest default was used. The copy for that pattern says so itself. */
  readonly matched: boolean;
  readonly evidence: readonly EnergyEvidenceLine[];
  readonly whatItOftenLooksLike: string;
  readonly whatThisDoesNotTellUs: string;
  readonly universalLimits: string;
  readonly tryToday: { readonly title: string; readonly body: string };
};

export type ThreeDayNote = { readonly day: string; readonly watchFor: string };

const EVIDENCE_LINE_COUNT = 3;

/**
 * The evidence, drawn only from questions this visitor actually answered
 * with an option this experience actually offers. An answer with no echo
 * entry is SKIPPED rather than rendered vaguely, which is why the copy test
 * asserts the echo table is total: a gap there would quietly shorten a
 * result instead of failing loudly.
 */
export function buildEvidence(
  answers: EnergyAnswers,
  order: readonly string[]
): EnergyEvidenceLine[] {
  const lines: EnergyEvidenceLine[] = [];
  for (const questionKey of order) {
    if (lines.length >= EVIDENCE_LINE_COUNT) break;
    const answerValue = answers[questionKey];
    if (!answerValue) continue;
    const echo = ANSWER_ECHOES[questionKey]?.[answerValue];
    if (!echo) continue;
    lines.push({ questionKey, answerValue, text: `You told us ${echo}.` });
  }
  return lines;
}

export function buildEnergyResult(answers: EnergyAnswers): EnergyResult {
  const resolution = resolveEnergyPattern(answers);
  const copy = ENERGY_PATTERN_COPY[resolution.key];

  return {
    patternKey: resolution.key,
    title: copy.title,
    summary: copy.summary,
    matched: resolution.matched,
    evidence: buildEvidence(answers, copy.evidenceOrder),
    whatItOftenLooksLike: copy.whatItOftenLooksLike,
    whatThisDoesNotTellUs: copy.whatThisDoesNotTellUs,
    universalLimits: RESULT_UNIVERSAL_LIMITS,
    tryToday: copy.tryToday,
  };
}

/** The email-gated extra. Deliberately a separate call from buildEnergyResult, because the free result is complete without it. */
export function buildThreeDayNotes(patternKey: PublicEntryPatternKey): readonly ThreeDayNote[] {
  return ENERGY_PATTERN_COPY[patternKey].threeDayNotes;
}

/**
 * Whether a set of answers is finished enough to produce a result at all.
 * Re-exported here so a caller building a result never has to import from
 * two places to know whether it may.
 */
export const canBuildResult = isComplete;
