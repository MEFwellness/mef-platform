/**
 * Deterministic explanation builder — picks the strongest domain and the
 * primary opportunity domain from real computed scores, and assembles
 * the supportive copy a member sees. No LLM call, no randomness: the same
 * domain scores always produce the same explanation. An AI-generated
 * explanation layered on top later (per the product spec) can read these
 * structured fields without the score itself ever depending on a model
 * response.
 */

import type { DomainScore, ScoreDomainKey, ScoreFactor } from '@mef/shared-types-contracts';
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
    "We don't have enough data yet to explain your Root Score. Keep checking in, logging meals, and moving — MEF Wellness will start identifying real patterns.",
  nextAction: null,
};

function capitalize(text: string): string {
  return text.length === 0 ? text : `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

export function buildExplanation(domainScores: DomainScore[]): ExplanationResult {
  const available = domainScores.filter((d): d is DomainScore & { score: number } => d.score !== null);
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

  let explanationSummary: string;
  if (!hasRange) {
    explanationSummary = `Your Root Score is currently grounded in ${strongest.label.toLowerCase()} data — more domains will factor in as you check in, log meals, and move.`;
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
