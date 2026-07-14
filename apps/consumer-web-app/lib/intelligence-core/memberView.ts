/**
 * Member-facing sanitizer — "Members should only see: Positive insights,
 * Progress, Achievements, Patterns they can understand ... they should
 * never see technical scoring." Strips confidence, evidence, domain codes,
 * and coach-only fields down to plain statements, and applies a minimum
 * confidence floor so a barely-formed observation never reaches a member
 * before it's actually reliable.
 */

import type { WellnessIdentityObservation } from '@mef/shared-types-contracts';
import type { IntelligenceCoreSummary, MemberWellnessHighlight, MemberWellnessStorySummary } from './types';

const MIN_CONFIDENCE_FOR_MEMBER = 0.6;
const MAX_MEMBER_HIGHLIGHTS = 4;

export function toMemberWellnessHighlights(
  observations: WellnessIdentityObservation[]
): MemberWellnessHighlight[] {
  return observations
    .filter((o) => o.status === 'active' && o.member_visible && o.confidence >= MIN_CONFIDENCE_FOR_MEMBER)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_MEMBER_HIGHLIGHTS)
    .map((o) => ({ id: o.id, statement: o.statement }));
}

/** Same stripping discipline as toMemberWellnessHighlights, for the Wellness Story dashboard's strengths/opportunities/priorities sections. */
export function toMemberWellnessStorySummary(
  summary: IntelligenceCoreSummary
): MemberWellnessStorySummary {
  return {
    topStrengths: summary.topStrengths.map((s) => s.title),
    biggestOpportunities: summary.biggestOpportunities.map((o) => o.title),
    emergingConcerns: summary.emergingConcerns,
    recentWins: summary.recentWins,
    longTermTrendSummary: summary.longTermTrendSummary,
    motivationProfile: summary.motivationProfile,
    primaryPriorityTitle: summary.prioritization.primary?.title ?? null,
    secondaryPriorityTitles: summary.prioritization.secondary.map((s) => s.title),
  };
}
