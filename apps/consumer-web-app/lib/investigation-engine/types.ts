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

/** Member-facing three-value Priority (Method §4), the scale unlock triggers reason over. */
export type CoachingPriorityLevel = 'quiet' | 'worth_watching' | 'needs_attention_now';

/**
 * Per-domain Stage (Method §10). Deliberately not persisted anywhere yet —
 * Method Recommendation 8 calls for pressure-testing this against real
 * member data before committing it to schema. This type exists so the
 * unlock-trigger contract is complete and forward-compatible; no
 * `InvestigationMetadata` entry in this phase actually declares a
 * `stage_gated` trigger (see registry.ts) — that's the Performance-tier
 * work explicitly deferred per the Investigation Library's own phased
 * rollout (§12).
 */
export type CoachingStage =
  | 'discovery'
  | 'stabilization'
  | 'optimization'
  | 'integration'
  | 'renewal';

/**
 * The five reusable unlock-trigger types (Investigation Library §1.3).
 * `unlockEngine.ts` evaluates each of these against a member's current
 * state; an investigation can declare more than one (any one satisfied is
 * enough to unlock it — this mirrors how the real Root Router fragments
 * already combine independently-sufficient conditions, e.g.
 * `pickRecommendation`'s coach-assigned tier vs. its due-reassessment
 * tier).
 */
export type UnlockTrigger =
  | { kind: 'priority'; domain: CoachingDomain; minPriority: CoachingPriorityLevel }
  | { kind: 'finding_routed'; domain: RegistryDomain; minSeverity: 'moderate' | 'significant' }
  | { kind: 'stage_gated'; requiredDomains: CoachingDomain[]; minStage: CoachingStage }
  | { kind: 'cadence_triggered' }
  | { kind: 'member_initiated' };

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
 * The full 13-field contract (Investigation Library §0 / Method §6),
 * expressed as real, evaluable TypeScript rather than markdown prose.
 * Everything here is additive metadata joined onto an existing
 * `AssessmentDefinition` by `key` — no field on that type is duplicated
 * unless its *meaning* here is genuinely different (e.g. `unlockTriggers`
 * is structured where `AssessmentDefinition.prerequisites.unlockRule` is
 * still free-text/null).
 */
export type InvestigationMetadata = {
  key: AssessmentKey;
  coachingDomains: CoachingDomain[];
  category: InvestigationCategory;
  primaryObjective: string;
  whyItExists: string;
  unlockTriggers: UnlockTrigger[];
  requiredPriorInvestigationKeys: AssessmentKey[];
  optionalPriorInvestigationKeys: AssessmentKey[];
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
