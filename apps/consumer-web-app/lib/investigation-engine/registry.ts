/**
 * Investigation Engine — the Investigation Registry (Prompt 9). This is an
 * EXTENSION layer, not a new source of truth: `INVESTIGATION_METADATA`
 * joins onto the real, existing `ASSESSMENT_REGISTRY`
 * (lib/assessment-registry/registry.ts) by `AssessmentKey`, adding
 * descriptive metadata about what each investigation is for. Nothing here
 * changes `AssessmentDefinition` or any real entry in that registry.
 *
 * IT NO LONGER DECIDES WHO SEES ANYTHING (Visibility Layer, 2026-08-17).
 * The `unlockTriggers` and `requiredPriorInvestigationKeys` fields every
 * entry below used to declare are gone, along with the evaluator that never
 * ran. Who sees which assessment is decided in lib/visibility/catalog.ts,
 * in one vocabulary, for assessments and everything else alike. What is
 * left here is genuine description: what an investigation is for, which
 * hypotheses it examines, what shape of signal it hands back, and how often
 * it should be retaken.
 *
 * Domain mappings below follow the real, already-shipped
 * `CATEGORY_FINDING_MAP` choices in lib/registry/adapters/
 * questionnaireEngine.ts wherever one exists. Where a category has no
 * clean Coaching Domain fit (Method's twelve domains don't include a
 * dedicated "immune," "cardiovascular," or "cognitive" domain), the
 * closest defensible domain is used and flagged in a comment — the same
 * "flag the gap, don't force a bad fit silently" discipline the
 * architecture docs used throughout.
 */

import type { AssessmentKey } from '../assessment-registry/types';
import type { InvestigationMetadata } from './types';

export const INVESTIGATION_METADATA: Record<AssessmentKey, InvestigationMetadata> = {
  'onboarding-health-history': {
    key: 'onboarding-health-history',
    coachingDomains: [
      'identity_self_concept',
      'purpose_motivation',
      'stress_nervous_system',
      'emotional_resilience_mood',
      'sleep_circadian_rhythm',
      'movement_physical_capacity',
      'recovery_energy_regulation',
      'pain_structural_integrity',
      'nutrition_metabolic_health',
      'digestion_gut_health',
      'relationships_social_connection',
      'environment_daily_rhythm',
    ],
    category: 'core',
    primaryObjective:
      "Populate the member's first Root Map: breadth over depth, across every domain at once.",
    whyItExists:
      'The one mandatory instrument; without it nothing else in the library can unlock (the blanket safety gate every Focused investigation shares).',
    hypothesesInvestigated: [],
    confidenceContributionDomains: [
      'stress_nervous_system',
      'emotional_resilience_mood',
      'sleep_circadian_rhythm',
      'movement_physical_capacity',
      'recovery_energy_regulation',
      'pain_structural_integrity',
      'nutrition_metabolic_health',
      'digestion_gut_health',
    ],
    rootModelContribution: {
      registryDomains: ['sleep', 'stress', 'nutrition'],
      shape: 'structured_metric',
    },
    reassessmentCadence: { kind: 'member_initiated' },
    commonlyUnlocksNextKeys: [
      'chek-hlc1-nutrition-lifestyle',
      'four-doctors',
      'body-assessment',
      'short-haq',
    ],
  },

  'chek-hlc1-nutrition-lifestyle': {
    key: 'chek-hlc1-nutrition-lifestyle',
    coachingDomains: [
      'nutrition_metabolic_health',
      'digestion_gut_health',
      'stress_nervous_system',
      'sleep_circadian_rhythm',
    ],
    category: 'single_domain_deep_dive',
    primaryObjective:
      'A real depth pass on eating patterns, digestion, and the stress/circadian factors that interact with them.',
    whyItExists:
      'Food and how it fuels you deserves a dedicated deep dive beyond the Foundational Investigation light touch.',
    hypothesesInvestigated: [
      'Is eating pattern or quality the driver of concern',
      'Is stress independently elevated alongside nutrition findings',
      'Is her sleep and wake rhythm irregular',
    ],
    confidenceContributionDomains: [
      'nutrition_metabolic_health',
      'digestion_gut_health',
      'stress_nervous_system',
      'sleep_circadian_rhythm',
    ],
    rootModelContribution: {
      registryDomains: ['nutrition', 'stress', 'sleep'],
      shape: 'priority_classification',
    },
    reassessmentCadence: { kind: 'member_initiated' },
    commonlyUnlocksNextKeys: [],
  },

  'four-doctors': {
    key: 'four-doctors',
    coachingDomains: [
      'emotional_resilience_mood',
      'sleep_circadian_rhythm',
      'nutrition_metabolic_health',
      'movement_physical_capacity',
    ],
    category: 'multi_domain_screener',
    primaryObjective:
      'A broad, four-category pass across mood, sleep, diet, and movement to identify which needs a closer look.',
    whyItExists:
      'A moderate-depth screener across several domains at once, catching a member whose Foundational flags were ambiguous between domains.',
    hypothesesInvestigated: [
      'Which of mood, sleep, diet, or movement is the actual limiting domain',
    ],
    confidenceContributionDomains: [
      'emotional_resilience_mood',
      'sleep_circadian_rhythm',
      'nutrition_metabolic_health',
      'movement_physical_capacity',
    ],
    rootModelContribution: {
      registryDomains: ['stress', 'sleep', 'nutrition', 'movement'],
      shape: 'priority_classification',
    },
    reassessmentCadence: { kind: 'member_initiated' },
    commonlyUnlocksNextKeys: [],
  },

  'primal-pattern-diet-type': {
    key: 'primal-pattern-diet-type',
    coachingDomains: ['nutrition_metabolic_health'],
    category: 'classification',
    primaryObjective: 'Sort the member into a dietary pattern type, not a severity score.',
    whyItExists: 'Useful classification for a domain where the output is "which type," not "how bad.”',
    hypothesesInvestigated: [],
    confidenceContributionDomains: ['nutrition_metabolic_health'],
    rootModelContribution: {
      registryDomains: ['nutrition'],
      shape: 'structured_metric',
    },
    reassessmentCadence: { kind: 'member_initiated' },
    commonlyUnlocksNextKeys: [],
  },

  'body-assessment': {
    key: 'body-assessment',
    coachingDomains: ['pain_structural_integrity'],
    category: 'media_capture_review',
    primaryObjective: 'Camera/sensor-based structural and postural screening, coach-reviewed.',
    whyItExists: 'Self-report alone is unreliable for structural findings.',
    hypothesesInvestigated: [],
    confidenceContributionDomains: ['pain_structural_integrity'],
    rootModelContribution: {
      registryDomains: ['posture', 'movement', 'breathing'],
      shape: 'priority_classification',
    },
    reassessmentCadence: { kind: 'member_initiated' },
    commonlyUnlocksNextKeys: [],
  },

  'short-haq': {
    key: 'short-haq',
    // Broadest live instrument (9 categories). "immune_and_respiratory,"
    // "cardiovascular_and_circulation," and "cognitive_clarity" have no
    // dedicated Coaching Domain in Method §5's twelve — mapped to the
    // closest defensible domain (recovery/energy, recovery/energy, and
    // stress respectively) rather than forced into a false-precision fit.
    // "hormonal_balance" similarly has no dedicated domain; mapped to
    // Nutrition & Metabolic Health as the closest coaching lens.
    coachingDomains: [
      'digestion_gut_health',
      'recovery_energy_regulation',
      'sleep_circadian_rhythm',
      'stress_nervous_system',
      'movement_physical_capacity',
      'nutrition_metabolic_health',
    ],
    category: 'multi_domain_screener',
    primaryObjective:
      'A broad, nine-category symptom-frequency screener across digestion, energy, sleep, stress/mood, immune, musculoskeletal, cardiovascular, cognitive, and hormonal patterns.',
    whyItExists:
      'The broadest live screener; gives the Root Router nine simultaneous domain-shaped signals from one attempt.',
    hypothesesInvestigated: [
      'Which of the nine symptom categories is showing up most often for this member',
    ],
    confidenceContributionDomains: [
      'digestion_gut_health',
      'recovery_energy_regulation',
      'sleep_circadian_rhythm',
      'stress_nervous_system',
      'movement_physical_capacity',
      'nutrition_metabolic_health',
    ],
    rootModelContribution: {
      registryDomains: ['nutrition', 'movement', 'sleep', 'stress', 'breathing', 'hormone'],
      shape: 'priority_classification',
    },
    reassessmentCadence: { kind: 'member_initiated' },
    commonlyUnlocksNextKeys: [],
  },

  wbsa: {
    key: 'wbsa',
    // Broadest live instrument by body-system count (16 sections). Only
    // the 7 physical/body-oriented Coaching Domains apply — WBSA's content
    // brief is explicitly body-system, not identity/purpose/relationships/
    // environment, so those four are correctly left out rather than forced.
    coachingDomains: [
      'stress_nervous_system',
      'sleep_circadian_rhythm',
      'movement_physical_capacity',
      'recovery_energy_regulation',
      'pain_structural_integrity',
      'nutrition_metabolic_health',
      'digestion_gut_health',
    ],
    category: 'multi_domain_screener',
    primaryObjective:
      'A walk through 16 short areas of everyday life: how meals sit with you, how things move through, energy between meals, breathing, circulation, temperature and pace, stress and demand, monthly changes, focus, aches, skin, cravings, and recovery.',
    whyItExists:
      'The first real content on the Unified Adaptive Assessment Runtime; gives the Root Router the widest simultaneous body-system signal of any live instrument.',
    hypothesesInvestigated: [
      'Which of the sixteen body systems shows the strongest concentration of reported patterns for this member',
    ],
    confidenceContributionDomains: [
      'stress_nervous_system',
      'sleep_circadian_rhythm',
      'movement_physical_capacity',
      'recovery_energy_regulation',
      'pain_structural_integrity',
      'nutrition_metabolic_health',
      'digestion_gut_health',
    ],
    rootModelContribution: {
      // Immune/circulatory/renal/neurological/dermatological have no
      // dedicated Coaching Domain above (same gap Short HAQ's comment
      // already flags for immune/cardiovascular/cognitive) — listed here
      // because the registry domains themselves are real and populated,
      // even where no Coaching Domain rollup exists for them yet.
      registryDomains: [
        'digestive', 'metabolic', 'immune', 'breathing', 'circulatory', 'renal',
        'stress', 'hormone', 'neurological', 'movement', 'dermatological', 'nutrition', 'sleep',
      ],
      shape: 'priority_classification',
    },
    reassessmentCadence: { kind: 'member_initiated' },
    commonlyUnlocksNextKeys: [],
  },

  // --- Coming Soon placeholders — minimal, honest stubs (Investigation
  // Library §12's phased rollout defers real content design for these). ---

  'readiness-to-change': {
    key: 'readiness-to-change',
    // Feeds Capacity (Method §2), a cross-domain concept, not a single
    // Coaching Domain — Investigation Library §2/§19's own framing.
    coachingDomains: [],
    category: 'behavioral_readiness',
    primaryObjective:
      'Stage-of-change and behavior-change readiness: how much new coaching load the member can take on right now.',
    whyItExists: "Pacing to Capacity, not just to what a domain's severity alone would support.",
    hypothesesInvestigated: [
      'Is the member in a stage of change where a new Experiment is likely to stick',
    ],
    confidenceContributionDomains: [],
    rootModelContribution: { registryDomains: [], shape: 'narrative_observation' },
    reassessmentCadence: { kind: 'member_initiated' },
    commonlyUnlocksNextKeys: [],
  },

  'finding-1-love': {
    key: 'finding-1-love',
    // No content designed yet — catalog placeholder only.
    coachingDomains: [],
    category: 'single_domain_deep_dive',
    primaryObjective: 'Not yet designed. Coming Soon catalog placeholder.',
    whyItExists: 'Not yet designed.',
    hypothesesInvestigated: [],
    confidenceContributionDomains: [],
    rootModelContribution: { registryDomains: [], shape: 'narrative_observation' },
    reassessmentCadence: { kind: 'member_initiated' },
    commonlyUnlocksNextKeys: [],
  },
  'core-values-snapshot': {
    key: 'core-values-snapshot',
    // A values/preference instrument, not a body-system or symptom
    // screener — the four Coaching Domains that actually apply are
    // identity/purpose/relationships/stress, same reasoning WBSA's own
    // comment uses in reverse (it lists only the seven physical domains).
    coachingDomains: ['identity_self_concept', 'purpose_motivation', 'relationships_social_connection', 'stress_nervous_system'],
    category: 'core',
    primaryObjective:
      'Surface which of six value areas (health, relationships, growth, purpose, freedom, peace) matters most to a member right now, and whether their reported last two weeks actually protected it.',
    whyItExists:
      "The app's new free-tier entry point (Experience 1 of 3): establishes what a member is protecting before any symptom or body-system content, per the product's own ordering.",
    hypothesesInvestigated: [
      'Which of six value areas matters most to this member right now',
      "Whether the member's last two weeks actually protected their top value, or a gap has opened between the two",
    ],
    confidenceContributionDomains: ['identity_self_concept', 'purpose_motivation', 'relationships_social_connection', 'stress_nervous_system'],
    rootModelContribution: {
      // Deliberately empty — a values/preference instrument, not a
      // symptom instrument, so it produces zero Universal Registry
      // findings by design (see migration 134's own header comment).
      registryDomains: [],
      shape: 'narrative_observation',
    },
    reassessmentCadence: { kind: 'member_initiated' },
    commonlyUnlocksNextKeys: [],
  },
  'life-signal-check': {
    key: 'life-signal-check',
    // A listening instrument across six body signals, not a symptom
    // screener — mapped to the coaching domains those six signals
    // actually correspond to (energy/recovery, sleep, stress/tension,
    // digestion, pain/structure, and mood for the "quiet mind" signal).
    coachingDomains: [
      'recovery_energy_regulation',
      'sleep_circadian_rhythm',
      'stress_nervous_system',
      'digestion_gut_health',
      'pain_structural_integrity',
      'emotional_resilience_mood',
    ],
    category: 'core',
    primaryObjective:
      'Listen for where a member’s life is speaking the loudest right now, across six signals: energy, sleep, tension, digestion, body, and mind.',
    whyItExists:
      "The app's free-tier entry point's second conversation (Experience 2 of 3): finds what's pressing on the member, right after Core Values Snapshot establishes what they're protecting, per the product's own ordering.",
    hypothesesInvestigated: [
      'Which of six signals (energy, sleep, tension, digestion, body, mind) is loudest for this member right now',
      'Whether the loudest signal is genuinely adjacent to the value the member said matters most (Body-Value Echo)',
    ],
    confidenceContributionDomains: [
      'recovery_energy_regulation',
      'sleep_circadian_rhythm',
      'stress_nervous_system',
      'digestion_gut_health',
      'pain_structural_integrity',
      'emotional_resilience_mood',
    ],
    rootModelContribution: {
      // Deliberately empty — a listening instrument, not a symptom
      // instrument, so it produces zero Universal Registry findings by
      // design (see migration 138's own header comment).
      registryDomains: [],
      shape: 'narrative_observation',
    },
    reassessmentCadence: { kind: 'member_initiated' },
    commonlyUnlocksNextKeys: [],
  },
  'readiness-pulse': {
    key: 'readiness-pulse',
    // A readiness/behavior-change instrument, not a body-system or
    // symptom screener — identity/purpose and stress are the two
    // Coaching Domains a capacity-and-willingness readiness read
    // actually speaks to, same reasoning Core Values Snapshot's own
    // comment uses for its four.
    coachingDomains: ['identity_self_concept', 'purpose_motivation', 'stress_nervous_system'],
    category: 'core',
    primaryObjective:
      'Find out, honestly and with zero judgment, whether a member is actually ready to act: derived from real willingness and capacity answers, but her own direct pick always wins.',
    whyItExists:
      "The app's free-tier entry point's third and final conversation (Experience 3 of 3): closes the free arc by answering the one question the first two conversations earned, right after Life Signal Check finds what's loudest, per the product's own ordering.",
    hypothesesInvestigated: [
      'Whether the member is genuinely ready now, ready if it stays small, still deciding, or not yet, by her own direct pick',
      'Whether the derived willingness/capacity read agrees with her own pick, and what her stated coaching style and biggest obstacle are',
    ],
    confidenceContributionDomains: ['identity_self_concept', 'purpose_motivation', 'stress_nervous_system'],
    rootModelContribution: {
      // Deliberately empty — a readiness/behavior-change instrument, not
      // a symptom instrument, so it produces zero Universal Registry
      // findings by design (see migration 141's own header comment).
      registryDomains: [],
      shape: 'narrative_observation',
    },
    reassessmentCadence: { kind: 'member_initiated' },
    commonlyUnlocksNextKeys: [],
  },
};

export function getInvestigationMetadata(key: AssessmentKey): InvestigationMetadata {
  return INVESTIGATION_METADATA[key];
}

export function listInvestigationMetadata(): InvestigationMetadata[] {
  return Object.values(INVESTIGATION_METADATA);
}
