/**
 * Investigation Engine — Coaching Domain taxonomy (Rooted Reset Method v2
 * §5, docs/rooted-reset-method/METHODOLOGY.md). Twelve independently
 * investigable, independently experimentable domains, kept as pure
 * app-layer constants and reconciliation tables — per Method
 * Recommendation 1, this deliberately does NOT become a new stored enum
 * anywhere. Every existing domain-shaped column in this codebase
 * (`onboarding_questions.domain`, `registry_entries.domain`,
 * `DOMAIN_WEIGHTS` keys, `LongitudinalTrend.area`) keeps its own real,
 * narrower vocabulary; this file only maps the Method's coaching-layer
 * taxonomy onto each of them, many-to-one, the same reasoning Method
 * Recommendation 1 already applied to the five-cluster/twelve-domain
 * question.
 *
 * Root Model and Router §11 (docs/rooted-reset-method/ROOT-MODEL-AND-ROUTER.md)
 * is the source of truth for four of these five vocabularies; this file is
 * the first place they're expressed as real, importable TypeScript rather
 * than a markdown table.
 */

import type { RegistryDomain } from '@mef/shared-types-contracts';
import type { ScoreDomainKey } from '@mef/shared-types-contracts';
import type { WellnessMetricKey } from '../wellness/wellness-index';
import { DOMAIN_ORDER } from '../onboarding/baseline';

/** DOMAIN_ORDER includes the synthetic 'all' bucket; the real five clusters exclude it. */
export type OnboardingDomain = Exclude<(typeof DOMAIN_ORDER)[number], 'all'>;

export type CoachingDomain =
  | 'identity_self_concept'
  | 'purpose_motivation'
  | 'stress_nervous_system'
  | 'emotional_resilience_mood'
  | 'sleep_circadian_rhythm'
  | 'movement_physical_capacity'
  | 'recovery_energy_regulation'
  | 'pain_structural_integrity'
  | 'nutrition_metabolic_health'
  | 'digestion_gut_health'
  | 'relationships_social_connection'
  | 'environment_daily_rhythm';

export type CoachingDomainInfo = {
  domain: CoachingDomain;
  label: string;
  definition: string;
  /** Method §5 — four domains have no current cluster to map to. */
  isUninstrumented: boolean;
};

export const COACHING_DOMAINS: CoachingDomainInfo[] = [
  {
    domain: 'identity_self_concept',
    label: 'Identity & Self-Concept',
    definition:
      'How the member sees themselves in relation to their body and health; history of past attempts; self-efficacy.',
    isUninstrumented: true,
  },
  {
    domain: 'purpose_motivation',
    label: 'Purpose & Motivation',
    definition: "The member's why; values; what a meaningful day/week looks like to them.",
    isUninstrumented: true,
  },
  {
    domain: 'stress_nervous_system',
    label: 'Stress & Nervous System Regulation',
    definition: 'Perceived stress, regulation capacity, activation/recovery balance.',
    isUninstrumented: false,
  },
  {
    domain: 'emotional_resilience_mood',
    label: 'Emotional Resilience & Mood',
    definition:
      'Mood patterns and emotional-regulation strategies, distinct from acute stress load.',
    isUninstrumented: false,
  },
  {
    domain: 'sleep_circadian_rhythm',
    label: 'Sleep & Circadian Rhythm',
    definition: 'Sleep quality, timing, and consistency; circadian alignment.',
    isUninstrumented: false,
  },
  {
    domain: 'movement_physical_capacity',
    label: 'Movement & Physical Capacity',
    definition: 'Strength, mobility, movement variety and frequency.',
    isUninstrumented: false,
  },
  {
    domain: 'recovery_energy_regulation',
    label: 'Recovery & Energy Regulation',
    definition: 'Energy availability across the day/week; recovery from training and life load.',
    isUninstrumented: false,
  },
  {
    domain: 'pain_structural_integrity',
    label: 'Pain & Structural Integrity',
    definition: 'Pain patterns, posture, structural findings.',
    isUninstrumented: false,
  },
  {
    domain: 'nutrition_metabolic_health',
    label: 'Nutrition & Metabolic Health',
    definition: 'Eating patterns, macronutrient balance, metabolic markers where available.',
    isUninstrumented: false,
  },
  {
    domain: 'digestion_gut_health',
    label: 'Digestion & Gut Health',
    definition: 'GI symptoms, digestive comfort, gut-related patterns.',
    isUninstrumented: false,
  },
  {
    domain: 'relationships_social_connection',
    label: 'Relationships & Social Connection',
    definition: "Quality and depth of the member's social support and relationships.",
    isUninstrumented: true,
  },
  {
    domain: 'environment_daily_rhythm',
    label: 'Environment & Daily Rhythm',
    definition: 'Home/work environment, daily routine structure, light and time-of-day exposure.',
    isUninstrumented: true,
  },
];

export function getCoachingDomainInfo(domain: CoachingDomain): CoachingDomainInfo {
  const info = COACHING_DOMAINS.find((d) => d.domain === domain);
  if (!info) throw new Error(`Unknown CoachingDomain: ${domain}`);
  return info;
}

/**
 * Coaching Domain -> Onboarding's 5 clusters (`DOMAIN_ORDER`,
 * lib/onboarding/baseline.ts). Many-to-one; the four uninstrumented
 * domains map to null (no existing cluster flags them — Method
 * Recommendation 2).
 */
export const COACHING_DOMAIN_TO_ONBOARDING_CLUSTER: Record<CoachingDomain, OnboardingDomain | null> =
  {
    identity_self_concept: null,
    purpose_motivation: null,
    stress_nervous_system: 'mind_stress',
    emotional_resilience_mood: 'mind_stress',
    sleep_circadian_rhythm: 'sleep',
    movement_physical_capacity: 'movement_energy',
    recovery_energy_regulation: 'movement_energy',
    pain_structural_integrity: 'pain_structural',
    nutrition_metabolic_health: 'nutrition_digestion',
    digestion_gut_health: 'nutrition_digestion',
    relationships_social_connection: null,
    environment_daily_rhythm: null,
  };

/**
 * Coaching Domain -> RegistryDomain (registry_entries.domain, the
 * Universal Health Registry's real stored vocabulary). One-or-more
 * RegistryDomain values per Coaching Domain; empty array where no current
 * RegistryDomain value fits (a genuine gap, flagged rather than forced —
 * same honesty the architecture docs already applied to the mood/recovery
 * mapping gaps).
 */
export const COACHING_DOMAIN_TO_REGISTRY_DOMAIN: Record<CoachingDomain, RegistryDomain[]> = {
  identity_self_concept: [],
  purpose_motivation: [],
  stress_nervous_system: ['stress'],
  emotional_resilience_mood: ['stress'],
  sleep_circadian_rhythm: ['sleep'],
  movement_physical_capacity: ['movement'],
  recovery_energy_regulation: ['movement', 'sleep'],
  pain_structural_integrity: ['posture', 'movement', 'breathing'],
  nutrition_metabolic_health: ['nutrition'],
  digestion_gut_health: ['nutrition'],
  relationships_social_connection: [],
  environment_daily_rhythm: [],
};

/**
 * Coaching Domain -> ScoreDomainKey (Root Score's DOMAIN_WEIGHTS,
 * lib/scoring/config.ts). Root Score only has real longitudinal data for
 * five domains today; every Coaching Domain outside that gets an empty
 * array (Method §16's "an investigation should never write to Root Score
 * directly" already means this mapping is informational, not a write
 * path).
 */
export const COACHING_DOMAIN_TO_SCORE_DOMAIN: Record<CoachingDomain, ScoreDomainKey[]> = {
  identity_self_concept: [],
  purpose_motivation: [],
  stress_nervous_system: ['stress'],
  emotional_resilience_mood: ['stress'],
  sleep_circadian_rhythm: ['recovery'],
  movement_physical_capacity: ['movement'],
  recovery_energy_regulation: ['recovery'],
  pain_structural_integrity: ['movement'],
  nutrition_metabolic_health: ['nutrition'],
  digestion_gut_health: ['nutrition'],
  relationships_social_connection: [],
  environment_daily_rhythm: [],
};

/**
 * Coaching Domain -> WellnessMetricKey (lib/wellness/wellness-index.ts,
 * the LongitudinalTrend vocabulary most of the Intelligence Engine's
 * recommendation logic actually runs on).
 */
export const COACHING_DOMAIN_TO_WELLNESS_METRIC: Record<CoachingDomain, WellnessMetricKey[]> = {
  identity_self_concept: [],
  purpose_motivation: [],
  stress_nervous_system: ['stress'],
  emotional_resilience_mood: ['mood'],
  sleep_circadian_rhythm: ['sleep'],
  movement_physical_capacity: ['movement'],
  recovery_energy_regulation: ['energy'],
  pain_structural_integrity: ['pain'],
  nutrition_metabolic_health: [],
  digestion_gut_health: ['digestion'],
  relationships_social_connection: [],
  environment_daily_rhythm: [],
};
