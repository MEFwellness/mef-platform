/**
 * Investigation Engine — the Investigation Contract (Prompt 9). Every field
 * here is a direct instance of something docs/rooted-reset-method/
 * INVESTIGATION-LIBRARY.md §0 already specified per-investigation; this is
 * the first place it becomes real TypeScript. Keyed by the existing
 * `AssessmentKey` (lib/assessment-registry/types.ts) so an
 * `InvestigationMetadata` record always joins onto a real
 * `AssessmentDefinition` by key rather than duplicating or replacing any of
 * its fields (membership/program/coach/retake/versioning rules all stay
 * owned by that registry, untouched).
 */

import type { RegistryDomain } from '@mef/shared-types-contracts';
import type { AssessmentKey } from '../assessment-registry/types';
import type { CoachingDomain } from './domains';

/**
 * Investigation Library §1.1 category legend, extended with `advanced_synthesis`
 * (the one new category that document introduced for the Performance tier).
 */
export type InvestigationCategory =
  | 'core'
  | 'multi_domain_screener'
  | 'single_domain_deep_dive'
  | 'classification'
  | 'media_capture_review'
  | 'behavioral_readiness'
  | 'advanced_synthesis';

/**
 * Member-facing three-value Priority (Method §4). Still read by the Root
 * Map's chip; no longer the scale any unlock rule reasons over, since
 * visibility rules read canonical findings and evidence tiers instead.
 */
export type CoachingPriorityLevel = 'quiet' | 'worth_watching' | 'needs_attention_now';

/** Method §6 field 4 — what shape of signal an investigation hands back to the Root Model. */
export type RootModelContributionShape =
  | 'priority_classification'
  | 'structured_metric'
  | 'narrative_observation';

export type ReassessmentCadence =
  | { kind: 'calendar'; days: number }
  | { kind: 'member_initiated' }
  | { kind: 'finding_triggered' }
  | { kind: 'open_ended' };

/**
 * The Investigation Contract (Investigation Library §0 / Method §6),
 * expressed as real TypeScript rather than markdown prose. Everything here
 * is additive metadata joined onto an existing `AssessmentDefinition` by
 * `key`.
 *
 * THREE FIELDS LEFT THIS TYPE (Visibility Layer, 2026-08-17):
 * `unlockTriggers`, `requiredPriorInvestigationKeys` and
 * `optionalPriorInvestigationKeys`. They described who should see an
 * assessment, which is now decided in exactly one place
 * (lib/visibility/catalog.ts) for assessments, trackers, cards, screens and
 * follow-up question sets alike. Leaving a second declaration site here was
 * the specific hazard the audit named: two designed-but-inert unlock
 * vocabularies side by side, either of which a future feature could
 * innocently build on.
 */
export type InvestigationMetadata = {
  key: AssessmentKey;
  coachingDomains: CoachingDomain[];
  category: InvestigationCategory;
  primaryObjective: string;
  whyItExists: string;
  hypothesesInvestigated: string[];
  /** Which Coaching Domain(s) a completed attempt raises confidence in. */
  confidenceContributionDomains: CoachingDomain[];
  rootModelContribution: {
    registryDomains: RegistryDomain[];
    shape: RootModelContributionShape;
  };
  reassessmentCadence: ReassessmentCadence;
  commonlyUnlocksNextKeys: AssessmentKey[];
};
