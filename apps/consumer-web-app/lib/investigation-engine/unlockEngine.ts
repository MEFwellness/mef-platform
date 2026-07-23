/**
 * Investigation Engine — unlock trigger evaluation (Investigation Library
 * §1.3). Generalizes the same pattern `findingRecommendations.ts`'s
 * `DOMAIN_ROUTES` already established (a fixed, reviewed table matched
 * against a member's active findings) into a reusable evaluator that
 * covers all five trigger types an `InvestigationMetadata` entry can
 * declare, not just the finding-routed one. Pure functions only — no I/O;
 * the caller (rootRouter.ts) is responsible for gathering
 * `UnlockContext`.
 */

import type { RegistryEntry, RegistryEntrySeverity } from '@mef/shared-types-contracts';
import type { AssessmentKey } from '../assessment-registry/types';
import type { MemberAssessmentFacts } from '../assessment-registry/status';
import { COACHING_DOMAIN_TO_REGISTRY_DOMAIN } from './domains';
import type { CoachingDomain } from './domains';
import type { CoachingPriorityLevel, InvestigationMetadata, UnlockTrigger } from './types';

export type UnlockContext = {
  activeFindings: RegistryEntry[];
  /** Investigation keys the member has at least one completed attempt of. */
  completedInvestigationKeys: ReadonlySet<AssessmentKey>;
  facts?: MemberAssessmentFacts;
  now?: Date;
};

const PRIORITY_RANK: Record<CoachingPriorityLevel, number> = {
  quiet: 0,
  worth_watching: 1,
  needs_attention_now: 2,
};

const SEVERITY_RANK: Record<RegistryEntrySeverity, number> = {
  none: 0,
  unknown: 0,
  mild: 1,
  moderate: 2,
  significant: 3,
};

/**
 * A domain-level Priority read, simplified for the foundation layer:
 * severity-only (the strongest active, member-visible finding mapped into
 * this Coaching Domain), no staleness/recency weighting yet. Method §7
 * step 3 (recency decay) and the full Confidence-aware Priority model are
 * intentionally left for a later pass — see confidence.ts's own scope note
 * for the matching caveat on domain Confidence.
 */
export function computeCoachingDomainPriority(
  domain: CoachingDomain,
  activeFindings: RegistryEntry[]
): CoachingPriorityLevel {
  const registryDomains = new Set(COACHING_DOMAIN_TO_REGISTRY_DOMAIN[domain]);
  if (registryDomains.size === 0) return 'quiet';

  const matching = activeFindings.filter(
    (f) =>
      f.status === 'active' &&
      f.entry_kind === 'finding' &&
      registryDomains.has(f.domain) &&
      f.severity !== null &&
      f.severity !== 'none'
  );

  if (matching.some((f) => f.severity === 'significant')) return 'needs_attention_now';
  if (matching.some((f) => f.severity === 'moderate')) return 'worth_watching';
  return 'quiet';
}

function evaluatePriorityTrigger(
  trigger: Extract<UnlockTrigger, { kind: 'priority' }>,
  context: UnlockContext
): boolean {
  const level = computeCoachingDomainPriority(trigger.domain, context.activeFindings);
  return PRIORITY_RANK[level] >= PRIORITY_RANK[trigger.minPriority];
}

function evaluateFindingRoutedTrigger(
  trigger: Extract<UnlockTrigger, { kind: 'finding_routed' }>,
  context: UnlockContext
): boolean {
  return context.activeFindings.some(
    (f) =>
      f.status === 'active' &&
      f.entry_kind === 'finding' &&
      f.domain === trigger.domain &&
      f.severity !== null &&
      SEVERITY_RANK[f.severity] >= SEVERITY_RANK[trigger.minSeverity]
  );
}

/**
 * Always false today — per-domain Stage (Method §10) is intentionally not
 * persisted or computed anywhere yet (Method Recommendation 8: pressure-
 * test before committing structurally). No live `InvestigationMetadata`
 * entry declares a `stage_gated` trigger in this phase (Performance-tier
 * investigations, Investigation Library §12's Phase 4, are explicitly
 * deferred) — this function exists so the trigger contract stays complete
 * and a future Stage implementation only has to fill this one function in,
 * not change the contract shape.
 */
function evaluateStageGatedTrigger(): boolean {
  return false;
}

function evaluateCadenceTriggeredTrigger(context: UnlockContext): boolean {
  const now = context.now ?? new Date();
  const schedule = context.facts?.pendingReassessmentSchedule;
  return Boolean(schedule && new Date(schedule.dueAt) <= now);
}

export function isUnlockTriggerSatisfied(trigger: UnlockTrigger, context: UnlockContext): boolean {
  switch (trigger.kind) {
    case 'priority':
      return evaluatePriorityTrigger(trigger, context);
    case 'finding_routed':
      return evaluateFindingRoutedTrigger(trigger, context);
    case 'stage_gated':
      return evaluateStageGatedTrigger();
    case 'cadence_triggered':
      return evaluateCadenceTriggeredTrigger(context);
    case 'member_initiated':
      // Always satisfiable by definition (Method §7 step 4, member agency)
      // — the caller decides whether to actually surface it as a
      // recommendation vs. leave it self-selectable; this function only
      // answers "could the member start this right now."
      return true;
    default: {
      const exhaustive: never = trigger;
      return exhaustive;
    }
  }
}

/**
 * The blanket gate every Focused Investigation shares (Method §7 step 1,
 * generalized here to each investigation's own declared required priors,
 * not just "Foundational must be complete"), plus at least one declared
 * unlock trigger being satisfied. An investigation with zero declared
 * triggers (Core investigations) is always unlocked once its required
 * priors are met.
 */
export function isInvestigationUnlocked(
  metadata: InvestigationMetadata,
  context: UnlockContext
): boolean {
  const missingRequiredPriors = metadata.requiredPriorInvestigationKeys.filter(
    (key) => !context.completedInvestigationKeys.has(key)
  );
  if (missingRequiredPriors.length > 0) return false;

  if (metadata.unlockTriggers.length === 0) return true;
  return metadata.unlockTriggers.some((trigger) => isUnlockTriggerSatisfied(trigger, context));
}
