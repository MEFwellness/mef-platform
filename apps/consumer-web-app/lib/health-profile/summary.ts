/**
 * Pure composition of the compact HealthProfileSummary jsonb rollup stored
 * in member_health_profiles.summary — no I/O, same discipline as
 * lib/intelligence-engine/summary.ts. Every field traces back to a real,
 * already-computed value; nothing here is invented. identityHighlights is
 * intentionally left empty: Intelligence Core's own identity observations
 * aren't part of this function's inputs (they're read separately, under a
 * different visibility model), and a signal with no real data behind it is
 * empty here, never guessed at, same discipline MemberHealthProfile's own
 * docblock establishes.
 */

import type { HealthProfileSummary, RegistryEntry, WellnessInsight } from '@mef/shared-types-contracts';
import type { MemberIntelligenceReport, RecommendationPriority } from '../intelligence-engine/types';

const TOP_N = 3;

/** 'high' must outrank 'medium' must outrank 'low' — alphabetical order gets this backwards ('high' < 'low' < 'medium'), same pitfall lib/intelligence/data.ts's SEVERITY_RANK avoids for wellness_insights.severity. */
const PRIORITY_RANK: Record<RecommendationPriority, number> = { high: 2, medium: 1, low: 0 };

export function buildHealthProfileSummary(
  report: MemberIntelligenceReport,
  registryEntries: RegistryEntry[],
  wellnessInsights: WellnessInsight[]
): HealthProfileSummary {
  const activeFindings = registryEntries.filter(
    (e) => e.entry_kind === 'finding' && e.status === 'active'
  );
  const activeRegistryFindingsBySeverity: Record<string, number> = {};
  for (const finding of activeFindings) {
    const key = finding.severity ?? 'unknown';
    activeRegistryFindingsBySeverity[key] = (activeRegistryFindingsBySeverity[key] ?? 0) + 1;
  }

  const topPriorities = [...report.recommendations]
    .sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || b.confidence - a.confidence)
    .slice(0, TOP_N)
    .map((r) => r.title);

  const wellnessInsightHighlights = wellnessInsights.slice(0, TOP_N).map((i) => i.title);

  const assessmentDerivedTimestamps = registryEntries
    .filter((e) => e.source_feature === 'body_assessment_finding' || e.source_feature === 'assessment_ai_observation')
    .map((e) => e.recorded_at)
    .sort();
  const lastAssessmentPublishedAt = assessmentDerivedTimestamps.length
    ? assessmentDerivedTimestamps[assessmentDerivedTimestamps.length - 1]!
    : null;

  return {
    topPriorities,
    activeRegistryFindingsBySeverity,
    wellnessInsightHighlights,
    identityHighlights: [],
    lastAssessmentPublishedAt,
  };
}
