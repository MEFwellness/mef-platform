/**
 * Deterministic explanation builder — picks the strongest domain and the
 * primary opportunity domain from real computed scores, and assembles the
 * supportive copy a member sees. No LLM call, no randomness: the same
 * domain scores always produce the same explanation.
 *
 * DATA FLOOR (Member Interpretation Layer, 2026-08-17). This function used
 * to sort the available domain scores and declare the top one a strength
 * and the bottom one the opportunity, with no minimum data requirement and
 * no gate of any kind. The only guard was that more than one domain had a
 * score at all. Live on Home and on Root Score on 2026-08-17, from three
 * check-ins in thirteen days over a recovery score of 50 out of 100:
 *
 *   "Your recovery is a real strength, while movement consistency is your
 *    clearest opportunity."
 *
 * Recovery scored 50. It was not a strength, it was the least bad of five
 * thin numbers, and a ranking was being printed as a verdict.
 *
 * Below the floor this now says what Case View says: it is early, here is
 * how much there is, that is expected. Above the floor the behaviour is
 * exactly what it always was. The floor itself lives in
 * lib/member-interpretation/config.ts so Root Score and every other surface
 * are held to one number.
 */

import type { DomainScore, ScoreDomainKey, ScoreFactor } from '@mef/shared-types-contracts';
import { computeDataFloor } from '../member-interpretation/dataFloor';
import { DOMAIN_COPY } from './copy';

export type ExplanationResult = {
  strongestDomain: ScoreDomainKey | null;
  primaryOpportunityDomain: ScoreDomainKey | null;
  positiveFactors: ScoreFactor[];
  limitingFactors: ScoreFactor[];
  explanationSummary: string;
  nextAction: string | null;
};

const NO_DATA_EXPLANATION: ExplanationResult = {
  strongestDomain: null,
  primaryOpportunityDomain: null,
  positiveFactors: [],
  limitingFactors: [],
  explanationSummary:
    "We don't have enough data yet to explain your Root Score. Keep checking in, logging meals, and moving. MEF Wellness will start identifying real patterns.",
  nextAction: null,
};

function capitalize(text: string): string {
  return text.length === 0 ? text : `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/**
 * `loggedDays` is DISTINCT days the member has a completed check-in inside
 * the evidence window. Not check-in count, not days since signup.
 *
 * Optional, defaulted to a value above the floor, so every existing caller
 * and fixture that does not pass it keeps its exact previous behaviour and
 * the change is visible only where it is genuinely wired up. The one real
 * caller, lib/scoring/calculate.ts, passes the member's real count.
 */
export function buildExplanation(
  domainScores: DomainScore[],
  loggedDays?: number
): ExplanationResult {
  const available = domainScores.filter(
    (d): d is DomainScore & { score: number } => d.score !== null
  );
  if (available.length === 0) return NO_DATA_EXPLANATION;

  const sortedDescending = [...available].sort((a, b) => b.score - a.score);
  const strongest = sortedDescending[0]!;
  const opportunity = sortedDescending[sortedDescending.length - 1]!;
  const hasRange = available.length > 1 && strongest.domain !== opportunity.domain;

  const positiveFactors: ScoreFactor[] = sortedDescending
    .filter((d) => d.score >= 60)
    .slice(0, 2)
    .map((d) => ({ domain: d.domain, label: d.label, detail: d.explanation }));

  const limitingFactors: ScoreFactor[] = [...sortedDescending]
    .reverse()
    .filter((d) => d.score < 60)
    .slice(0, 2)
    .map((d) => ({ domain: d.domain, label: d.label, detail: d.explanation }));

  // Below the floor there is no strength and no opportunity. Not a quieter
  // strength, not a hedged one: the claim is not made, and the honest
  // sentence about how little there is takes its place. The next action
  // still comes through, because "here is one small thing to do" is a
  // suggestion rather than a verdict about her.
  const floor = loggedDays === undefined ? null : computeDataFloor(loggedDays);
  if (floor && !floor.met) {
    return {
      strongestDomain: null,
      primaryOpportunityDomain: null,
      positiveFactors: [],
      limitingFactors: [],
      explanationSummary: floor.statement,
      nextAction: DOMAIN_COPY[opportunity.domain].nextAction,
    };
  }

  let explanationSummary: string;
  if (!hasRange) {
    explanationSummary = `Your Root Score is currently grounded in ${strongest.label.toLowerCase()} data, more domains will factor in as you check in, log meals, and move.`;
  } else {
    explanationSummary = `${capitalize(DOMAIN_COPY[strongest.domain].strengthPhrase)}, while ${DOMAIN_COPY[opportunity.domain].opportunityPhrase}.`;
  }

  return {
    strongestDomain: strongest.domain,
    primaryOpportunityDomain: hasRange ? opportunity.domain : null,
    positiveFactors,
    limitingFactors,
    explanationSummary,
    nextAction: DOMAIN_COPY[opportunity.domain].nextAction,
  };
}
