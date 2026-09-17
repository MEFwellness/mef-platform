/**
 * The HAQ scoring engine, pure. Server and coach side only.
 *
 * Per section, independently: member response, then hidden value, then
 * section total, then that section's own cutoffs, then the result state.
 *
 * THE DATABASE RUNS THE SAME RULES. Migration 262's triggers store each
 * answer's hidden value and write the 21 section results in the same
 * transaction that completes the instance, reading the numbers this
 * module's rules file seeded. tests/haq-runtime-integration.test.ts
 * completes real instances at every section's four boundaries and asserts
 * the stored results equal what this module computes, so the two cannot
 * drift without the suite failing.
 *
 * MISSING IS NOT ZERO. An unanswered question contributes nothing, and an
 * instance with any unanswered question has no section results at all:
 * `scoreHaqInstance` returns null rather than a partial reading.
 */

import { HAQ_QUESTIONS, HAQ_SECTIONS } from './questionBank';
import { HAQ_SECTION_CUTOFFS, haqHiddenValue } from './scoringRules';
import type {
  HaqMemberResultLabel,
  HaqOriginalPriority,
  HaqQuestion,
  HaqResultColor,
  HaqSectionId,
} from './types';

export type HaqResultState = {
  resultColor: HaqResultColor;
  memberResultLabel: HaqMemberResultLabel;
  originalPriority: HaqOriginalPriority;
};

export type HaqSectionResult = HaqResultState & { sectionId: HaqSectionId; rawTotal: number };

/** Green = Doing Well = Low Priority. Yellow = Needs Attention = Moderate Priority. Red = High Attention = High Priority. */
export const HAQ_RESULT_STATES: Record<HaqResultColor, HaqResultState> = {
  green: { resultColor: 'green', memberResultLabel: 'Doing Well', originalPriority: 'Low Priority' },
  yellow: { resultColor: 'yellow', memberResultLabel: 'Needs Attention', originalPriority: 'Moderate Priority' },
  red: { resultColor: 'red', memberResultLabel: 'High Attention', originalPriority: 'High Priority' },
};

/** One section's total against that section's own cutoffs. Throws for an unknown section or an impossible total. */
export function classifyHaqSectionTotal(sectionId: HaqSectionId, total: number): HaqResultState {
  const cutoffs = HAQ_SECTION_CUTOFFS[sectionId];
  if (!cutoffs) throw new Error(`Unknown HAQ section: ${sectionId}`);
  if (!Number.isInteger(total) || total < 0) throw new Error(`Invalid HAQ section total: ${total}`);
  if (total <= cutoffs.greenMax) return HAQ_RESULT_STATES.green;
  if (total <= cutoffs.yellowMax) return HAQ_RESULT_STATES.yellow;
  return HAQ_RESULT_STATES.red;
}

/** question key to the response she selected. An absent key is an unanswered question. */
export type HaqResponses = Readonly<Record<string, string>>;

function hiddenValueOf(question: HaqQuestion, response: string): number {
  const value = haqHiddenValue(question.responseType, response);
  if (value === null) {
    throw new Error(`Response "${response}" is not accepted for ${question.key} (${question.responseType})`);
  }
  return value;
}

/**
 * The section's total from answered questions only, or null when any
 * question in the section is unanswered.
 */
export function haqSectionTotal(sectionId: HaqSectionId, responses: HaqResponses): number | null {
  let total = 0;
  for (const question of HAQ_QUESTIONS) {
    if (question.sectionId !== sectionId) continue;
    const response = responses[question.key];
    if (response === undefined) return null;
    total += hiddenValueOf(question, response);
  }
  return total;
}

/**
 * All 21 section results, or null while any of the 260 questions is
 * unanswered. There is deliberately no overall total in what this returns.
 */
export function scoreHaqInstance(responses: HaqResponses): HaqSectionResult[] | null {
  if (HAQ_QUESTIONS.some((question) => responses[question.key] === undefined)) return null;
  return HAQ_SECTIONS.map((section) => {
    const rawTotal = haqSectionTotal(section.id, responses) as number;
    return { sectionId: section.id, rawTotal, ...classifyHaqSectionTotal(section.id, rawTotal) };
  });
}
