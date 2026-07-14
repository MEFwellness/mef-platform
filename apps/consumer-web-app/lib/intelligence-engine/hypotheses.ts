/**
 * Root Cause Hypotheses — coaching hypotheses, never diagnoses. Every
 * hypothesis this module can produce is a deterministic rule over this
 * run's own LongitudinalTrend[]/PatternInsight[] (never free text, never
 * an LLM), and every one separates known facts (what the data directly
 * shows) from likely patterns (what commonly co-occurs with that) from
 * possible explanations (framed as "may"/"could," always alongside at
 * least one alternative explanation) — the milestone's own required
 * three-way separation. Confidence is deliberately discounted below the
 * underlying trends' own confidence (a HYPOTHESIS_DISCOUNT factor) because
 * inferring a relationship between two real trends is always less certain
 * than either trend on its own.
 */

import { areaLabel } from '../intelligence/copy';
import type {
  MemberHealthProfile,
  LongitudinalTrend,
  PatternInsight,
  RootCauseHypothesis,
} from './types';

const HYPOTHESIS_DISCOUNT = 0.85;
const MIN_CONFIDENCE_TO_SURFACE = 0.5;

function trendFor(trends: LongitudinalTrend[], area: string): LongitudinalTrend | undefined {
  return trends.find((t) => t.area === area);
}

function pairedDeclineHypothesis(
  trends: LongitudinalTrend[],
  areaA: string,
  areaB: string,
  statement: string,
  recommendedCoachingDirection: string,
  alternativeExplanations: string[]
): RootCauseHypothesis | null {
  const a = trendFor(trends, areaA);
  const b = trendFor(trends, areaB);
  if (!a || !b || a.direction !== 'declining' || b.direction !== 'declining') return null;

  const confidence = Math.min(a.confidence, b.confidence) * HYPOTHESIS_DISCOUNT;
  if (confidence < MIN_CONFIDENCE_TO_SURFACE) return null;

  return {
    id: `paired_decline_${areaA}_${areaB}`,
    statement,
    confidence,
    knownFacts: [
      `${areaLabel(a.area)} has been declining over the last 30 days.`,
      `${areaLabel(b.area)} has been declining over the last 30 days.`,
    ],
    likelyPatterns: [
      `${areaLabel(a.area)} and ${areaLabel(b.area)} are declining at the same time.`,
    ],
    possibleExplanations: [statement],
    supportingEvidence: [...a.evidenceRefs, ...b.evidenceRefs],
    alternativeExplanations,
    recommendedCoachingDirection,
  };
}

function burnoutHypothesis(patterns: PatternInsight[]): RootCauseHypothesis | null {
  const burnout = patterns.find((p) => p.kind === 'burnout_signal');
  if (!burnout) return null;

  const confidence = burnout.confidence * HYPOTHESIS_DISCOUNT;
  if (confidence < MIN_CONFIDENCE_TO_SURFACE) return null;

  return {
    id: 'possible_overextension',
    statement:
      'The combination of declining wellness areas and reduced coaching engagement may reflect overextension or fatigue rather than a lack of motivation.',
    confidence,
    knownFacts: [burnout.description],
    likelyPatterns: ['This combination of signals commonly co-occurs with burnout.'],
    possibleExplanations: [
      'The member may be overextended and need a lighter, more sustainable pace.',
    ],
    supportingEvidence: burnout.evidenceRefs,
    alternativeExplanations: [
      'Could reflect a temporary, unrelated life disruption (travel, illness, a busy period at work) rather than an ongoing pattern.',
      'Could simply be a natural dip in engagement that resolves on its own without any change in coaching approach.',
    ],
    recommendedCoachingDirection:
      'Lead with a lighter, no-pressure check-in before reintroducing any new challenge or goal.',
  };
}

function plateauHypothesis(patterns: PatternInsight[]): RootCauseHypothesis | null {
  const plateau = patterns.find((p) => p.kind === 'plateau');
  if (!plateau) return null;

  const confidence = plateau.confidence * HYPOTHESIS_DISCOUNT;
  if (confidence < MIN_CONFIDENCE_TO_SURFACE) return null;

  return {
    id: `plateau_strategy_${plateau.key}`,
    statement: `${plateau.label} — the current coaching approach for this area may have reached its ceiling and could benefit from a different strategy.`,
    confidence,
    knownFacts: [plateau.description],
    likelyPatterns: [
      'A metric that holds flat despite continued coaching often needs a new approach rather than more repetition of the same one.',
    ],
    possibleExplanations: [
      'The current suggested actions for this area may no longer be challenging or novel enough to produce further change.',
    ],
    supportingEvidence: plateau.evidenceRefs,
    alternativeExplanations: [
      'The member may already be at a realistic, sustainable baseline for this area, and "flat" is actually a good outcome.',
      'An unmeasured factor outside this app (a medical condition, a life circumstance) may be capping further improvement.',
    ],
    recommendedCoachingDirection:
      'Consider a different type of intervention for this area, or explicitly discuss whether the current level is an acceptable, sustainable target.',
  };
}

function consistencyBarrierHypothesis(
  profile: MemberHealthProfile,
  patterns: PatternInsight[]
): RootCauseHypothesis | null {
  const repeatingBarrier = patterns.find((p) => p.kind === 'repeating_barrier');
  const lowAdherence = profile.adherence.level === 'low' && profile.adherence.sampleSize >= 5;
  if (!repeatingBarrier && !lowAdherence) return null;

  // A repeating_barrier pattern already cleared its own confidence floor
  // (lib/intelligence/confidence.ts's MIN_CONFIDENCE_TO_PERSIST), so it's
  // trusted directly; adherence alone (with no named pattern behind it) is
  // a weaker, more general signal but still real enough at this sample
  // size to surface after the standard hypothesis discount.
  const confidence = (repeatingBarrier?.confidence ?? 0.65) * HYPOTHESIS_DISCOUNT;
  if (confidence < MIN_CONFIDENCE_TO_SURFACE) return null;

  return {
    id: 'consistency_barrier',
    statement:
      'A recurring, unnamed barrier may be getting in the way of consistent follow-through, more than a lack of interest in the coaching itself.',
    confidence,
    knownFacts: [
      repeatingBarrier?.description ??
        'Completion of suggested daily coaching actions has been low over a meaningful sample of days.',
    ],
    likelyPatterns: [
      'Repeated incomplete follow-through often traces back to a specific, recurring practical barrier (time, access, competing priorities) rather than disengagement.',
    ],
    possibleExplanations: [
      'A specific, recurring practical barrier (scheduling, energy, access) may be worth naming directly in conversation.',
    ],
    supportingEvidence: repeatingBarrier?.evidenceRefs ?? [],
    alternativeExplanations: [
      'The suggested actions themselves may not fit this member’s current routine or preferences, independent of any external barrier.',
      'This could be a short, temporary dip rather than a stable pattern.',
    ],
    recommendedCoachingDirection:
      'Ask directly what has been getting in the way, rather than assuming the cause — this data can only show that something is, not what.',
  };
}

export function buildRootCauseHypotheses(
  profile: MemberHealthProfile,
  trends: LongitudinalTrend[],
  patterns: PatternInsight[]
): RootCauseHypothesis[] {
  const candidates = [
    pairedDeclineHypothesis(
      trends,
      'stress',
      'sleep',
      'Elevated stress may be contributing to reduced sleep quality, or reduced sleep may be contributing to elevated stress.',
      'Explore stress-reduction and sleep hygiene together in the same conversation rather than as two separate topics.',
      [
        'An unrelated third factor (a life event, a schedule change) could be driving both independently.',
        'The relationship could run in only one direction rather than both — the data alone cannot establish which.',
      ]
    ),
    pairedDeclineHypothesis(
      trends,
      'pain',
      'movement',
      'Increasing pain or discomfort may be limiting movement, or reduced movement may be contributing to increased stiffness and discomfort.',
      'Favor gentle, pain-aware movement options and suggest checking with a healthcare provider if discomfort persists or worsens.',
      [
        'The reduced movement could be caused by something unrelated to pain (schedule, motivation, weather).',
        'The pain could have a cause entirely outside this app’s scope — never something to diagnose here.',
      ]
    ),
    pairedDeclineHypothesis(
      trends,
      'stress',
      'digestion',
      'Elevated stress may be contributing to digestive discomfort — a well-established but individually variable connection.',
      'Pair stress-reduction suggestions with digestion coaching rather than treating them as unrelated.',
      [
        'Digestive changes could stem from diet or another factor unrelated to stress.',
        'The two trends may simply be coincidental rather than connected for this specific member.',
      ]
    ),
    burnoutHypothesis(patterns),
    plateauHypothesis(patterns),
    consistencyBarrierHypothesis(profile, patterns),
  ];

  return candidates.filter((h): h is RootCauseHypothesis => h !== null);
}
