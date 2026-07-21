/**
 * Pattern Recognition — reuses every detector the Personal Wellness
 * Intelligence Engine (lib/intelligence/patternEngine.ts,
 * lib/intelligence/baselineEngine.ts) already runs and persists as
 * `wellness_insights` rows, re-shaping each into this engine's
 * PatternInsight report shape rather than re-detecting anything. Only two
 * detectors are genuinely new here — burnout signal and plateau detection
 * — because nothing upstream already computes them; both are pure,
 * deterministic, and built entirely from data this engine already has
 * (MemberHealthProfile + this run's own LongitudinalTrend[]), same
 * "careful language, never causation" discipline as every existing
 * detector.
 */

import type { WellnessInsight } from '@mef/shared-types-contracts';
import { areaLabel } from '../intelligence/copy';
import { buildRegistryPatternInsights } from './registryFindings';
import { buildCrossAssessmentCorrelations } from './crossAssessmentCorrelations';
import type { MemberHealthProfile, LongitudinalTrend, PatternInsight, PatternKind } from './types';

const KIND_BY_PATTERN_KEY_PREFIX: [prefix: string, kind: PatternKind][] = [
  ['checkin_weekday_strength', 'weekend_adherence'],
  ['category_weekday_dip_', 'weekend_adherence'],
  ['disruption_recovery', 'recovery_after_setback'],
  ['repeated_success_', 'effective_coaching_strategy'],
  ['content_followed_by_', 'effective_coaching_strategy'],
  ['repeated_saved_not_completed', 'repeating_barrier'],
  ['category_neglect_', 'repeating_barrier'],
  ['divergence_', 'domain_relationship'],
  ['since_baseline_', 'post_reassessment_change'],
];

function kindForInsight(insight: WellnessInsight): PatternKind {
  const match = KIND_BY_PATTERN_KEY_PREFIX.find(([prefix]) =>
    insight.pattern_key.startsWith(prefix)
  );
  if (match) return match[1];
  return insight.severity === 'info' ? 'consistency_improvement' : 'repeating_barrier';
}

/** Every existing pattern-shaped wellness_insight, re-shaped — never re-derived. Includes since_baseline_* rows (insight_type 'trend' in the source engine, but genuinely "changes after reassessments" per this milestone's own Pattern Recognition list). */
function existingPatterns(profile: MemberHealthProfile): PatternInsight[] {
  return profile.wellnessInsights
    .filter(
      (insight) =>
        insight.insight_type === 'pattern' || insight.pattern_key.startsWith('since_baseline_')
    )
    .map((insight) => ({
      key: insight.pattern_key,
      kind: kindForInsight(insight),
      label: insight.title,
      description: insight.member_summary,
      confidence: insight.confidence,
      evidenceRefs: insight.evidence_refs,
      sourceInsightId: insight.id,
    }));
}

const BURNOUT_RELEVANT_AREAS = new Set(['stress', 'energy', 'mood', 'sleep']);
const MIN_DECLINING_AREAS_FOR_BURNOUT = 2;
const NO_CHECKIN_DAYS_FOR_BURNOUT = 3;

/**
 * A real, deterministic burnout signal: adherence has genuinely dropped
 * (not just one off day) AND at least two of the four burnout-relevant
 * areas (stress, energy, mood, sleep) are concurrently declining — a
 * single declining metric is an ordinary trend, not a burnout signal.
 * Never asserts burnout itself, only that the pattern resembles one and
 * is worth a coach's attention.
 */
function burnoutSignalPattern(
  profile: MemberHealthProfile,
  trends: LongitudinalTrend[]
): PatternInsight | null {
  const decliningRelevant = trends.filter(
    (t) => BURNOUT_RELEVANT_AREAS.has(t.area) && t.direction === 'declining'
  );
  const adherenceDropped = profile.adherence.level === 'low' && profile.adherence.sampleSize >= 5;
  const goneQuiet =
    profile.streak.daysSinceLastCheckin !== null &&
    profile.streak.daysSinceLastCheckin >= NO_CHECKIN_DAYS_FOR_BURNOUT;

  if (
    decliningRelevant.length < MIN_DECLINING_AREAS_FOR_BURNOUT &&
    !(adherenceDropped && goneQuiet)
  ) {
    return null;
  }

  const areaLabels = decliningRelevant.map((t) => areaLabel(t.area)).join(', ');
  const confidence = Math.min(
    0.5 + decliningRelevant.length * 0.1 + (adherenceDropped ? 0.1 : 0) + (goneQuiet ? 0.1 : 0),
    0.85
  );

  return {
    key: 'burnout_signal',
    kind: 'burnout_signal',
    label: 'Signs consistent with burnout',
    description:
      decliningRelevant.length > 0
        ? `${areaLabels} have been declining together${adherenceDropped ? ', alongside lower coaching engagement' : ''} — a pattern that can resemble burnout, worth a gentler check-in rather than more intensity.`
        : `Coaching engagement has dropped and check-ins have gone quiet — a pattern that can resemble burnout, worth a gentler check-in rather than more intensity.`,
    confidence,
    evidenceRefs: decliningRelevant.flatMap((t) => t.evidenceRefs),
    sourceInsightId: null,
  };
}

const PLATEAU_STUCK_STATUSES = new Set(['attention', 'poor']);

/**
 * An area that has stayed flat (direction 'stable') at a suboptimal level
 * for both the last 30 AND last 90 days — genuinely stuck, not simply "no
 * change because it's already fine." A stable area sitting in the 'good'
 * band is a strength (see summary.ts), never flagged as a plateau.
 */
function plateauPatterns(trends: LongitudinalTrend[]): PatternInsight[] {
  return trends
    .filter((t) => t.direction === 'stable')
    .filter((t) => {
      const last30 = t.points.find((p) => p.window === 'last_30_days');
      const last90 = t.points.find((p) => p.window === 'last_90_days');
      return (
        last30?.status &&
        last90?.status &&
        PLATEAU_STUCK_STATUSES.has(last30.status) &&
        PLATEAU_STUCK_STATUSES.has(last90.status)
      );
    })
    .map((t) => ({
      key: `plateau_${t.area}`,
      kind: 'plateau' as const,
      label: `${areaLabel(t.area)} has plateaued`,
      description: `${areaLabel(t.area)} has held steady at a level that still needs attention across both the last 30 and last 90 days — the current approach may need a change rather than more repetition.`,
      confidence: Math.max(t.confidence, 0.55),
      evidenceRefs: t.evidenceRefs,
      sourceInsightId: null,
    }));
}

export function buildPatternInsights(
  profile: MemberHealthProfile,
  trends: LongitudinalTrend[]
): PatternInsight[] {
  const burnout = burnoutSignalPattern(profile, trends);
  return [
    ...existingPatterns(profile),
    ...(burnout ? [burnout] : []),
    ...plateauPatterns(trends),
    ...buildRegistryPatternInsights(profile),
    ...buildCrossAssessmentCorrelations(profile, trends),
  ];
}
