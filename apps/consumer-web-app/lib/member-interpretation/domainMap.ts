/**
 * Member Interpretation Layer — one finding, one home.
 *
 * The audit's clearest evidence violation: one slider answer at intake
 * wrote one registry row, and `COACHING_DOMAIN_TO_REGISTRY_DOMAIN` then
 * fanned that single row out across two or three Root Map domains, where
 * each appearance read as a separate observation. "Ongoing discomfort in
 * the hips" appeared under Recovery & Energy Regulation, Movement &
 * Physical Capacity AND Pain & Structural Integrity, with nothing on any of
 * the three saying they were the same answer.
 *
 * That table is not deleted and is not wrong: it answers "which registry
 * domains feed this coaching domain", which several systems still legitimately
 * need. It is simply the wrong table to render a finding from, because it is
 * one-to-many in the direction that duplicates.
 *
 * This file is the other direction, and it is one-to-ONE: every finding has
 * exactly one primary domain, plus a list of domains it is genuinely
 * relevant to. It renders in full in the first and as a single cross
 * reference line in the rest.
 *
 * Pure data and pure functions. No I/O.
 */

import type { RegistryDomain } from '@mef/shared-types-contracts';
import type { CoachingDomain } from '../investigation-engine/domains';
import { coachingDomainLabel } from '../naming/domainNames';

export type DomainAssignment = {
  /** Null when no coaching domain honestly covers this registry domain. */
  primary: CoachingDomain | null;
  /** Domains it is genuinely relevant to. Never includes `primary`. */
  alsoRelevant: CoachingDomain[];
};

/**
 * The default per registry domain. Exhaustive over RegistryDomain on
 * purpose: adding a registry domain to the contract forces a decision here
 * rather than silently falling into a default that puts a lab result on the
 * sleep card.
 *
 * The six with a null primary (lab, immune, circulatory, renal,
 * neurological, dermatological) and 'hormone'/'metabolic'/'questionnaire'
 * are the honest edges. Three of those nine do map: metabolic and hormone
 * both belong to metabolic health, and 'questionnaire' is the generic
 * bucket the questionnaire adapter uses when a category has no better
 * home, which in practice means it is decided by code below rather than by
 * this table.
 */
const DEFAULT_BY_REGISTRY_DOMAIN: Record<RegistryDomain, DomainAssignment> = {
  posture: { primary: 'pain_structural_integrity', alsoRelevant: ['movement_physical_capacity'] },
  movement: { primary: 'movement_physical_capacity', alsoRelevant: ['recovery_energy_regulation'] },
  breathing: { primary: 'stress_nervous_system', alsoRelevant: ['pain_structural_integrity'] },
  questionnaire: { primary: null, alsoRelevant: [] },
  sleep: { primary: 'sleep_circadian_rhythm', alsoRelevant: ['recovery_energy_regulation'] },
  stress: { primary: 'stress_nervous_system', alsoRelevant: ['emotional_resilience_mood'] },
  nutrition: { primary: 'nutrition_metabolic_health', alsoRelevant: ['digestion_gut_health'] },
  wearable: { primary: 'recovery_energy_regulation', alsoRelevant: ['sleep_circadian_rhythm'] },
  digestive: { primary: 'digestion_gut_health', alsoRelevant: ['nutrition_metabolic_health'] },
  metabolic: { primary: 'nutrition_metabolic_health', alsoRelevant: [] },
  hormone: { primary: 'nutrition_metabolic_health', alsoRelevant: ['recovery_energy_regulation'] },
  lab: { primary: null, alsoRelevant: [] },
  immune: { primary: null, alsoRelevant: [] },
  circulatory: { primary: null, alsoRelevant: [] },
  renal: { primary: null, alsoRelevant: [] },
  neurological: { primary: null, alsoRelevant: [] },
  dermatological: { primary: null, alsoRelevant: [] },
};

/**
 * Code-level overrides, for the cases where the registry domain a producer
 * chose is not where the finding actually belongs to a member reading it.
 *
 * Every entry here comes from a real, live example in the audit:
 *
 *   pain_*                       written to domain 'movement' by the
 *                                onboarding adapter, but a member reading
 *                                "ongoing discomfort in the hips" is
 *                                reading about pain, not about exercise.
 *   low_energy                   written to domain 'sleep', because energy
 *                                is asked next to sleep at intake. It is a
 *                                recovery finding that is relevant to sleep,
 *                                not the reverse.
 *   digestive_complaints         written to domain 'nutrition'. Digestion
 *                                has its own coaching domain and this is it.
 *   emotional_wellbeing_concern  written to domain 'stress'. Mood is a
 *                                distinct coaching domain from acute stress
 *                                load, which is exactly what the domain
 *                                definitions themselves say.
 */
const OVERRIDE_BY_CODE: Record<string, DomainAssignment> = {
  // Pain, from every producer that writes it.
  pain_neck: { primary: 'pain_structural_integrity', alsoRelevant: ['movement_physical_capacity'] },
  pain_shoulders: { primary: 'pain_structural_integrity', alsoRelevant: ['movement_physical_capacity'] },
  pain_upper_back: { primary: 'pain_structural_integrity', alsoRelevant: ['movement_physical_capacity'] },
  pain_lower_back: { primary: 'pain_structural_integrity', alsoRelevant: ['movement_physical_capacity'] },
  pain_hips: { primary: 'pain_structural_integrity', alsoRelevant: ['movement_physical_capacity'] },
  pain_knees: { primary: 'pain_structural_integrity', alsoRelevant: ['movement_physical_capacity'] },
  musculoskeletal_discomfort_pattern: {
    primary: 'pain_structural_integrity',
    alsoRelevant: ['movement_physical_capacity'],
  },

  // Energy and recovery.
  low_energy: { primary: 'recovery_energy_regulation', alsoRelevant: ['sleep_circadian_rhythm'] },
  energy_fatigue_pattern: {
    primary: 'recovery_energy_regulation',
    alsoRelevant: ['sleep_circadian_rhythm'],
  },

  // Digestion.
  digestive_complaints: {
    primary: 'digestion_gut_health',
    alsoRelevant: ['nutrition_metabolic_health'],
  },
  digestive_wellness_concern: {
    primary: 'digestion_gut_health',
    alsoRelevant: ['nutrition_metabolic_health'],
  },
  gut_fungal_parasite_concern: {
    primary: 'digestion_gut_health',
    alsoRelevant: ['nutrition_metabolic_health'],
  },

  // Mood, distinct from stress load.
  emotional_wellbeing_concern: {
    primary: 'emotional_resilience_mood',
    alsoRelevant: ['stress_nervous_system'],
  },

  // Sleep.
  circadian_disruption: {
    primary: 'sleep_circadian_rhythm',
    alsoRelevant: ['recovery_energy_regulation'],
  },
  sleep_quality_pattern: {
    primary: 'sleep_circadian_rhythm',
    alsoRelevant: ['recovery_energy_regulation'],
  },

  // Movement.
  movement_deficiency: {
    primary: 'movement_physical_capacity',
    alsoRelevant: ['recovery_energy_regulation'],
  },

  // Nutrition.
  nutrition_quality_concern: { primary: 'nutrition_metabolic_health', alsoRelevant: [] },
  diet_quality_concern: { primary: 'nutrition_metabolic_health', alsoRelevant: [] },
  meal_timing_irregularity: {
    primary: 'nutrition_metabolic_health',
    alsoRelevant: ['digestion_gut_health'],
  },
  detoxification_load_concern: { primary: 'nutrition_metabolic_health', alsoRelevant: [] },
};

/**
 * The one domain this finding is filed under, plus the domains it is
 * genuinely relevant to.
 *
 * `alsoRelevant` never contains `primary`, so a caller counting
 * `1 + alsoRelevant.length` is counting real distinct cards and can never
 * double the finding by accident.
 */
export function assignDomains(registryDomain: RegistryDomain, code: string): DomainAssignment {
  const assignment = OVERRIDE_BY_CODE[code] ?? DEFAULT_BY_REGISTRY_DOMAIN[registryDomain];
  return {
    primary: assignment.primary,
    alsoRelevant: assignment.alsoRelevant.filter((d) => d !== assignment.primary),
  };
}

/**
 * "Also shown under Movement & Physical Capacity." — the line that makes a
 * cross-reference legible as one finding in two places rather than as two
 * discoveries. Null when the finding belongs to one domain only, so no
 * screen renders an empty note.
 */
export function crossReferenceNote(alsoRelevant: readonly CoachingDomain[]): string | null {
  if (alsoRelevant.length === 0) return null;
  const labels = alsoRelevant.map((d) => coachingDomainLabel(d));
  if (labels.length === 1) return `Also shown under ${labels[0]}.`;
  const last = labels[labels.length - 1]!;
  return `Also shown under ${labels.slice(0, -1).join(', ')} and ${last}.`;
}
