/**
 * Cross-Assessment Correlation Engine (Prompt 6) — compares active
 * Universal Registry findings (lib/registry/, migration 40) across
 * different assessment sources/domains and surfaces known co-occurring
 * pairs as PatternInsight rows, same shape and same "recognizes supporting
 * evidence, never causation" discipline as every other detector in
 * patterns.ts. Nothing here is re-derived from scratch: every finding it
 * reads was already computed and written by a registry adapter
 * (bodyAssessment.ts, questionnaireEngine.ts, onboarding.ts,
 * primalPattern.ts, wearables.ts, foodLens.ts, movement.ts); this module's
 * only job is recognizing that two independently-observed facts about the
 * same member tend to occur together.
 *
 * Rules are a fixed, reviewed list (never inferred/learned) — the same
 * "config in code, not something the engine invents" posture as every
 * other correlation-adjacent module in this codebase. Each rule fires only
 * when BOTH sides have a real active finding; a member with only one side
 * present gets no correlation insight for that pair (a single fact is not
 * a correlation).
 */

import type { RegistryDomain } from '@mef/shared-types-contracts';
import type { LongitudinalTrend, MemberHealthProfile, PatternInsight } from './types';

type FindingSide = { domain: RegistryDomain; codes: string[] };

type CorrelationRule = {
  key: string;
  label: string;
  a: FindingSide;
  b: FindingSide;
  narrative: (aLabel: string, bLabel: string) => string;
};

const CORRELATION_RULES: CorrelationRule[] = [
  {
    key: 'poor_sleep_high_stress',
    label: 'Poor sleep and elevated stress',
    a: { domain: 'sleep', codes: ['poor_sleep_quality', 'circadian_disruption'] },
    b: { domain: 'stress', codes: ['elevated_stress', 'emotional_wellbeing_concern'] },
    narrative: (a, b) =>
      `${a} tends to coincide with ${b.toLowerCase()} — worth exploring together, not as two separate issues.`,
  },
  {
    key: 'neck_pain_forward_head',
    label: 'Neck discomfort and forward head posture',
    a: { domain: 'movement', codes: ['pain_neck', 'pain_upper_back'] },
    b: { domain: 'posture', codes: ['forward_head'] },
    narrative: (a, b) =>
      `${a} tends to coincide with ${b.toLowerCase()} on a structural assessment — a common pairing worth discussing together.`,
  },
  {
    key: 'hip_instability_knee_pain',
    label: 'Hip instability and hip/knee discomfort',
    a: { domain: 'movement', codes: ['hip_asymmetry'] },
    b: { domain: 'movement', codes: ['pain_hips', 'pain_knees'] },
    narrative: (a, b) =>
      `${a} tends to coincide with ${b.toLowerCase()} — a pattern worth a closer movement review.`,
  },
  {
    key: 'digestive_complaints_stress',
    label: 'Digestive complaints and elevated stress',
    a: { domain: 'nutrition', codes: ['digestive_complaints'] },
    b: { domain: 'stress', codes: ['elevated_stress', 'emotional_wellbeing_concern'] },
    narrative: (a, b) =>
      `${a} tends to coincide with ${b.toLowerCase()} — the two often move together.`,
  },
  {
    key: 'shoulder_mobility_breathing',
    label: 'Shoulder mobility limits and breathing pattern findings',
    a: { domain: 'posture', codes: ['rounded_shoulders', 'elevated_shoulder'] },
    b: { domain: 'breathing', codes: ['breathing_pattern'] },
    narrative: (a, b) =>
      `${a} tends to coincide with ${b.toLowerCase()} — upper-body posture and breathing mechanics often relate.`,
  },
];

function findMatch(entries: MemberHealthProfile['registryEntries'], side: FindingSide) {
  return entries.find(
    (e) => e.status === 'active' && e.domain === side.domain && side.codes.includes(e.code)
  );
}

function buildRuleCorrelations(profile: MemberHealthProfile): PatternInsight[] {
  const insights: PatternInsight[] = [];

  for (const rule of CORRELATION_RULES) {
    const matchA = findMatch(profile.registryEntries, rule.a);
    const matchB = findMatch(profile.registryEntries, rule.b);
    if (!matchA || !matchB) continue;

    const confidence =
      Math.round(Math.min(0.9, (matchA.confidence + matchB.confidence) / 2 + 0.1) * 100) / 100;

    insights.push({
      key: `correlation_${rule.key}`,
      kind: 'cross_assessment_correlation',
      label: rule.label,
      description: rule.narrative(matchA.label, matchB.label),
      confidence,
      evidenceRefs: [
        { type: 'registry_entry', id: matchA.id },
        { type: 'registry_entry', id: matchB.id },
      ],
      sourceInsightId: null,
    });
  }

  return insights;
}

const READINESS_RELEVANT_MOVEMENT_CODES = new Set(['movement_deficiency']);

/** "Movement history + readiness trends" — a movement-domain finding paired with a declining movement LongitudinalTrend, both already computed elsewhere. */
function buildMovementReadinessCorrelation(
  profile: MemberHealthProfile,
  trends: LongitudinalTrend[]
): PatternInsight | null {
  const movementFinding = profile.registryEntries.find(
    (e) =>
      e.status === 'active' &&
      e.domain === 'movement' &&
      READINESS_RELEVANT_MOVEMENT_CODES.has(e.code)
  );
  const movementTrend = trends.find((t) => t.area === 'movement' && t.direction === 'declining');
  if (!movementFinding || !movementTrend) return null;

  return {
    key: 'correlation_movement_readiness',
    kind: 'cross_assessment_correlation',
    label: 'Movement deficiency and declining movement readiness',
    description: `${movementFinding.label} tends to coincide with a declining movement trend from daily check-ins — the assessment finding and the day-to-day pattern point the same direction.`,
    confidence:
      Math.round(
        Math.min(0.9, (movementFinding.confidence + movementTrend.confidence) / 2 + 0.1) * 100
      ) / 100,
    evidenceRefs: [
      { type: 'registry_entry', id: movementFinding.id },
      ...movementTrend.evidenceRefs,
    ],
    sourceInsightId: null,
  };
}

export function buildCrossAssessmentCorrelations(
  profile: MemberHealthProfile,
  trends: LongitudinalTrend[]
): PatternInsight[] {
  const ruleCorrelations = buildRuleCorrelations(profile);
  const movementReadiness = buildMovementReadinessCorrelation(profile, trends);
  return [...ruleCorrelations, ...(movementReadiness ? [movementReadiness] : [])];
}
