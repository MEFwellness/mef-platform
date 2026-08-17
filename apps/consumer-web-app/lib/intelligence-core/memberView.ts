/**
 * Member-facing sanitizer — "Members should only see: Positive insights,
 * Progress, Achievements, Patterns they can understand ... they should
 * never see technical scoring." Strips confidence, evidence, domain codes,
 * and coach-only fields down to plain statements, and applies a minimum
 * confidence floor so a barely-formed observation never reaches a member
 * before it's actually reliable.
 */

import type { WellnessIdentityObservation } from '@mef/shared-types-contracts';
import type { DataFloor } from '../member-interpretation/types';
import type {
  IntelligenceCoreSummary,
  MemberWellnessHighlight,
  MemberWellnessStorySummary,
} from './types';

const MIN_CONFIDENCE_FOR_MEMBER = 0.6;
const MAX_MEMBER_HIGHLIGHTS = 4;

export function toMemberWellnessHighlights(
  observations: WellnessIdentityObservation[]
): MemberWellnessHighlight[] {
  return observations
    .filter(
      (o) => o.status === 'active' && o.member_visible && o.confidence >= MIN_CONFIDENCE_FOR_MEMBER
    )
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_MEMBER_HIGHLIGHTS)
    .map((o) => ({ id: o.id, statement: o.statement }));
}

/**
 * Same stripping discipline as toMemberWellnessHighlights, for the Wellness
 * Story dashboard's strengths/opportunities/priorities sections.
 *
 * DATA FLOOR (Member Interpretation Layer, 2026-08-17). "Strengths" and
 * "Opportunities" are the two claims on this screen that say something
 * about the member rather than reporting something she did, so they are
 * held to the layer's floor: below it they are not shown at all, and the
 * honest sentence about how little there is takes their place.
 *
 * Everything else on the panel survives the floor untouched, because none
 * of it is a verdict. Recent wins are things she actually did, the
 * motivation profile is her own stated preference, and the priority comes
 * from the Priority Card engine.
 */
export function toMemberWellnessStorySummary(
  summary: IntelligenceCoreSummary,
  dataFloor?: DataFloor
): MemberWellnessStorySummary {
  const belowFloor = dataFloor !== undefined && !dataFloor.met;

  return {
    topStrengths: belowFloor ? [] : summary.topStrengths.map((s) => s.title),
    biggestOpportunities: belowFloor ? [] : summary.biggestOpportunities.map((o) => o.title),
    emergingConcerns: summary.emergingConcerns,
    recentWins: summary.recentWins,
    longTermTrendSummary: summary.longTermTrendSummary,
    motivationProfile: summary.motivationProfile,
    primaryPriorityTitle: summary.prioritization.primary?.title ?? null,
    secondaryPriorityTitles: summary.prioritization.secondary.map((s) => s.title),
    dataFloorNote: belowFloor ? dataFloor.statement : null,
  };
}
