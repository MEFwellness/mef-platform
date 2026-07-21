/**
 * Root Score Integration (Prompt 6) — "every validated finding should
 * influence the existing Root Score using weighted confidence." A bounded,
 * confidence-weighted penalty applied to the relevant DomainScore(s)
 * before aggregation (lib/scoring/aggregate.ts), never touching the
 * composite/momentum/resilience math directly. Deliberately small and
 * capped per domain (MAX_ADJUSTMENT_PER_DOMAIN) — a single finding, no
 * matter how severe, can only nudge a domain, never dominate it; this
 * mirrors config.ts's own MAX_ROOT_SCORE_DAILY_CHANGE anti-gaming posture
 * (a structural safeguard, not a tuning knob to remove later).
 *
 * Only active, entry_kind='finding' registry entries apply — 'metric' rows
 * (e.g. Primal Pattern's classification) have no severity and never
 * adjust a domain. A domain the platform has no data for at all
 * (score: null) is left untouched: an adjustment to a null score would
 * fabricate a number from nothing, which every domain calculator in
 * lib/scoring/domains.ts already refuses to do.
 */

import type { DomainScore, RegistryEntry, ScoreDomainKey } from '@mef/shared-types-contracts';

const SEVERITY_PENALTY: Record<'mild' | 'moderate' | 'significant', number> = {
  mild: 2,
  moderate: 4,
  significant: 8,
};

const MAX_ADJUSTMENT_PER_DOMAIN = 10;

/** Registry findings map onto Root Score domains by real domain overlap — posture/movement/breathing findings affect Movement, sleep findings affect Recovery, stress/nutrition map directly. Onboarding/questionnaire pain findings are registered under 'movement' (lib/registry/adapters/onboarding.ts), so they land here too. */
const SCORE_DOMAIN_BY_REGISTRY_DOMAIN: Partial<Record<RegistryEntry['domain'], ScoreDomainKey>> = {
  posture: 'movement',
  movement: 'movement',
  breathing: 'movement',
  sleep: 'recovery',
  stress: 'stress',
  nutrition: 'nutrition',
};

function penaltyFor(finding: RegistryEntry): number {
  if (finding.severity === null || finding.severity === 'unknown' || finding.severity === 'none')
    return 0;
  return SEVERITY_PENALTY[finding.severity] * finding.confidence;
}

/** Pure — every input already fetched, no I/O, mirrors the rest of lib/scoring/'s discipline. */
export function applyFindingAdjustments(
  domainScores: DomainScore[],
  activeFindings: RegistryEntry[]
): DomainScore[] {
  const findingsByScoreDomain = new Map<ScoreDomainKey, RegistryEntry[]>();
  for (const finding of activeFindings) {
    if (finding.entry_kind !== 'finding' || finding.status !== 'active') continue;
    const scoreDomain = SCORE_DOMAIN_BY_REGISTRY_DOMAIN[finding.domain];
    if (!scoreDomain) continue;
    const bucket = findingsByScoreDomain.get(scoreDomain);
    if (bucket) bucket.push(finding);
    else findingsByScoreDomain.set(scoreDomain, [finding]);
  }

  return domainScores.map((domainScore) => {
    if (domainScore.score === null) return domainScore;

    const findings = findingsByScoreDomain.get(domainScore.domain);
    if (!findings || findings.length === 0) return domainScore;

    const totalPenalty = Math.min(
      MAX_ADJUSTMENT_PER_DOMAIN,
      findings.reduce((sum, f) => sum + penaltyFor(f), 0)
    );
    if (totalPenalty <= 0) return domainScore;

    const adjustedScore = Math.max(0, Math.round(domainScore.score - totalPenalty));
    return {
      ...domainScore,
      score: adjustedScore,
      explanation: `${domainScore.explanation} Adjusted for ${findings.length} active assessment finding${findings.length === 1 ? '' : 's'}.`,
    };
  });
}
