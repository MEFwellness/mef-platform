/**
 * Assessment Relationships (Prompt 6) — "every questionnaire should be
 * able to recommend another questionnaire… based on findings, not fixed
 * sequences." Distinct from lib/assessment-registry/recommendation.ts's
 * pickRecommendation(), which its own docblock is explicit is "never
 * random, never claims a health-pattern basis" — that function picks the
 * single next assessment from real *status* facts (coach assignment, due
 * reassessment, in-progress draft, program phase). This module is the
 * complementary, explicitly health-pattern-based half: given a member's
 * active Universal Registry findings, which OTHER assessments would help
 * explore what those findings are pointing at.
 *
 * Never diagnostic, never a fixed pipeline. Domain vocabulary only (never
 * an internal questionnaire id) in any copy this produces — per the
 * registry's own established rule (types.ts) and this member's standing
 * instruction to never surface internal questionnaire naming as a
 * member-facing cross-sell.
 */

import type { RegistryDomain, RegistryEntry } from '@mef/shared-types-contracts';
import type { AssessmentKey } from './types';

export type FindingBasedSuggestion = {
  assessmentKey: AssessmentKey;
  reason: string;
  supportingFindingCodes: string[];
};

type DomainRoute = { domain: RegistryDomain; assessmentKey: AssessmentKey; reason: string };

/** One real, reviewed relationship per domain — never a fixed multi-step pipeline. A member can have findings across several domains at once; every matching route is returned, ranked by how many findings support it. */
const DOMAIN_ROUTES: DomainRoute[] = [
  { domain: 'posture', assessmentKey: 'body-assessment', reason: 'movement and posture findings' },
  { domain: 'movement', assessmentKey: 'body-assessment', reason: 'movement and posture findings' },
  {
    domain: 'breathing',
    assessmentKey: 'body-assessment',
    reason: 'movement and posture findings',
  },
  {
    domain: 'nutrition',
    assessmentKey: 'chek-hlc1-nutrition-lifestyle',
    reason: 'nutrition and lifestyle patterns',
  },
  { domain: 'stress', assessmentKey: 'four-doctors', reason: 'stress and lifestyle balance' },
  { domain: 'sleep', assessmentKey: 'four-doctors', reason: 'sleep and rest patterns' },
];

/**
 * Only moderate/significant, active, member-visible findings count as
 * "supporting evidence" — a mild or already-superseded/resolved finding
 * isn't a strong enough signal to suggest another assessment over it.
 */
const QUALIFYING_SEVERITIES = new Set(['moderate', 'significant']);

export function suggestAssessmentsFromFindings(
  activeFindings: RegistryEntry[],
  options: { excludeAssessmentKeys?: AssessmentKey[] } = {}
): FindingBasedSuggestion[] {
  const exclude = new Set(options.excludeAssessmentKeys ?? []);
  const qualifying = activeFindings.filter(
    (f) =>
      f.entry_kind === 'finding' &&
      f.status === 'active' &&
      f.member_visible &&
      f.severity &&
      QUALIFYING_SEVERITIES.has(f.severity)
  );

  const byAssessment = new Map<AssessmentKey, { reason: string; codes: string[] }>();
  for (const route of DOMAIN_ROUTES) {
    if (exclude.has(route.assessmentKey)) continue;
    const matches = qualifying.filter((f) => f.domain === route.domain);
    if (matches.length === 0) continue;

    const existing = byAssessment.get(route.assessmentKey);
    const codes = matches.map((f) => f.code);
    if (existing) {
      existing.codes.push(...codes);
    } else {
      byAssessment.set(route.assessmentKey, { reason: route.reason, codes });
    }
  }

  return [...byAssessment.entries()]
    .map(([assessmentKey, { reason, codes }]) => ({
      assessmentKey,
      reason: `Based on ${reason} noticed recently.`,
      supportingFindingCodes: [...new Set(codes)],
    }))
    .sort((a, b) => b.supportingFindingCodes.length - a.supportingFindingCodes.length);
}
