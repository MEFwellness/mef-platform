/**
 * The Visibility Layer — the evaluator.
 *
 * Pure functions only, no I/O. Everything it needs is handed to it in a
 * `VisibilityContext`, which is what makes every rule in the catalog
 * testable without a database and what makes the coach's "why is she
 * seeing this" screen able to replay a decision.
 *
 * This is the evaluator the old `lib/investigation-engine/unlockEngine.ts`
 * described and never got to run, generalized off assessments. Two of its
 * five trigger kinds survive by name (`priority` became `domain_state`,
 * `finding_routed` became `finding_tier` and now reads canonical findings
 * and evidence tiers rather than raw severities); `member_initiated` is
 * gone, because "she could start it if she found it" is not a reason to put
 * something in front of her; `cadence_triggered` and `stage_gated` are gone
 * because nothing in the product declares them.
 */

import type { CoachingDomain } from '../investigation-engine/domains';
import type { AssessmentKey } from '../assessment-registry/types';
import type { CanonicalFinding, DomainState, EvidenceTier } from '../member-interpretation/types';
import { tierRank } from '../member-interpretation/types';
import type {
  AnswerPredicate,
  BehaviorSignal,
  FeatureDefinition,
  FeatureKey,
  RevealRule,
  TouchProbe,
  TouchSignal,
} from './types';

/** Whatever a stored intake answer can be. */
export type IntakeAnswerValue = string | number | boolean | string[] | null;

/**
 * Everything a rule may look at. Assembled once per member per request by
 * context.ts; nothing in here is fetched lazily, so a rule can never
 * accidentally cost a query.
 */
export type VisibilityContext = {
  /** Her intake answers, by question key. Only genuinely answered ones are present. */
  intakeAnswers: Map<string, IntakeAnswerValue>;
  /** Real counts of things she did. Every signal is always present, zero when she has done none. */
  behavior: Record<BehaviorSignal, number>;
  /** The canonical findings from the Member Interpretation Layer. Never raw registry rows. */
  findings: CanonicalFinding[];
  /** Each coaching domain's one state, from the same layer. */
  domainStates: Map<CoachingDomain, DomainState>;
  /** Assessments she has completed at least once. */
  completedAssessmentKeys: Set<AssessmentKey>;
  /** Features a coach has genuinely assigned, granted or enrolled her in. */
  coachAssignedFeatureKeys: Set<FeatureKey>;
  /** Per-feature history facts that are not plain counters. */
  touchSignals: Set<TouchSignal>;
  /** True when an open safety review is in force for her. */
  safetyActive: boolean;
};

/** An empty context. A member the layer could not read anything about sees only what safety and `always` reveal. */
export function emptyVisibilityContext(): VisibilityContext {
  return {
    intakeAnswers: new Map(),
    behavior: {
      checkin_days: 0,
      movement_days: 0,
      food_entries: 0,
      assessments_completed: 0,
      wearables_connected: 0,
      days_since_signup: 0,
    },
    findings: [],
    domainStates: new Map(),
    completedAssessmentKeys: new Set(),
    coachAssignedFeatureKeys: new Set(),
    touchSignals: new Set(),
    safetyActive: false,
  };
}

function asNumber(value: IntakeAnswerValue): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

function asStrings(value: IntakeAnswerValue): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (value === null) return [];
  return [String(value)];
}

export function answerSatisfies(value: IntakeAnswerValue | undefined, when: AnswerPredicate): boolean {
  if (value === undefined || value === null) return false;

  switch (when.op) {
    case 'answered':
      return true;
    case 'equals': {
      const values = asStrings(value);
      return values.some((v) => when.values.includes(v));
    }
    case 'includes': {
      const values = asStrings(value);
      return values.some((v) => when.values.includes(v));
    }
    case 'at_most': {
      const numeric = asNumber(value);
      return numeric !== null && numeric <= when.value;
    }
    case 'at_least': {
      const numeric = asNumber(value);
      return numeric !== null && numeric >= when.value;
    }
    default: {
      const exhaustive: never = when;
      return exhaustive;
    }
  }
}

/**
 * The code half of a canonical source key. `sourceKey` is
 * `${registryDomain}::${code}`, which the interpretation layer guarantees.
 */
function findingCode(finding: CanonicalFinding): string {
  const parts = finding.sourceKey.split('::');
  return parts[1] ?? finding.sourceKey;
}

function findingTierSatisfied(
  rule: Extract<RevealRule, { kind: 'finding_tier' }>,
  context: VisibilityContext
): boolean {
  const wanted = tierRank(rule.minTier as EvidenceTier);
  return context.findings.some((finding) => {
    if (rule.domain && finding.primaryDomain !== rule.domain) {
      // A cross-referenced domain is a genuine relevance, so a rule about
      // "anything going on in sleep" should see a finding filed under
      // recovery that is also relevant to sleep. This is deliberately
      // permissive in the reveal direction and never in the hide direction.
      if (!finding.alsoRelevantDomains.includes(rule.domain)) return false;
    }
    if (rule.codes && !rule.codes.includes(findingCode(finding))) return false;
    return tierRank(finding.tier) >= wanted;
  });
}

/** One rule, one answer. Exported so the coach screen can say exactly which rule fired. */
export function isRuleSatisfied(rule: RevealRule, context: VisibilityContext, featureKey: FeatureKey): boolean {
  switch (rule.kind) {
    case 'always':
      return true;
    case 'safety':
      // Safety-critical features are visible unconditionally. The rule
      // exists as a named kind rather than as `always` so that the coach
      // screen and the tests can tell "everyone needs this" apart from
      // "nobody may take this away", which are different promises.
      return true;
    case 'intake_answer':
      return answerSatisfies(context.intakeAnswers.get(rule.questionKey), rule.when);
    case 'behavior':
      return (context.behavior[rule.signal] ?? 0) >= rule.atLeast;
    case 'finding_tier':
      return findingTierSatisfied(rule, context);
    case 'domain_state': {
      const state = context.domainStates.get(rule.domain);
      return state !== undefined && rule.states.includes(state);
    }
    case 'completed_assessment':
      return rule.keys.every((key) => context.completedAssessmentKeys.has(key));
    case 'coach_assigned':
      return context.coachAssignedFeatureKeys.has(featureKey);
    default: {
      const exhaustive: never = rule;
      return exhaustive;
    }
  }
}

export type RuleOutcome = {
  satisfied: boolean;
  /** The first rule that fired, in catalog order. Null when none did. */
  firedRule: RevealRule | null;
};

/** Any one rule being satisfied reveals the feature. */
export function evaluateReveal(
  definition: FeatureDefinition,
  context: VisibilityContext
): RuleOutcome {
  for (const rule of definition.revealWhen) {
    if (isRuleSatisfied(rule, context, definition.key)) {
      return { satisfied: true, firedRule: rule };
    }
  }
  return { satisfied: false, firedRule: null };
}

/**
 * Rule 2, grandfathering. Anything she has already started, completed or
 * logged data in never disappears, whatever the reveal rules say. Hiding
 * only ever applies to the untouched.
 */
export function hasTouched(probe: TouchProbe, context: VisibilityContext): boolean {
  switch (probe.kind) {
    case 'none':
      return false;
    case 'assessment':
      return probe.keys.some((key) => context.completedAssessmentKeys.has(key));
    case 'behavior':
      return (context.behavior[probe.signal] ?? 0) > 0;
    case 'signal':
      return context.touchSignals.has(probe.signal);
    default: {
      const exhaustive: never = probe;
      return exhaustive;
    }
  }
}

/**
 * Plain-language explanation of a fired rule, for the coach's screen. Never
 * shown to a member: her sentence is the catalog's `revealSentence`, which
 * is written in Root's voice, and this one is written for someone who is
 * about to retune the rule.
 */
export function describeRule(rule: RevealRule): string {
  switch (rule.kind) {
    case 'always':
      return 'Visible to every member from the start.';
    case 'safety':
      return 'Safety. Cannot be hidden from anyone.';
    case 'intake_answer':
      return `Her intake answer to ${rule.questionKey} (${describePredicate(rule.when)}).`;
    case 'behavior':
      return `She has ${rule.signal.replaceAll('_', ' ')} of at least ${rule.atLeast}.`;
    case 'finding_tier':
      return `A finding${rule.domain ? ` in ${rule.domain.replaceAll('_', ' ')}` : ''} has reached ${rule.minTier.replaceAll('_', ' ')}.`;
    case 'domain_state':
      return `${rule.domain.replaceAll('_', ' ')} is in one of: ${rule.states.join(', ')}.`;
    case 'completed_assessment':
      return `She has completed ${rule.keys.join(', ')}.`;
    case 'coach_assigned':
      return 'Her coach assigned, granted or enrolled her in this.';
    default: {
      const exhaustive: never = rule;
      return exhaustive;
    }
  }
}

function describePredicate(when: AnswerPredicate): string {
  switch (when.op) {
    case 'answered':
      return 'answered at all';
    case 'equals':
      return `one of ${when.values.join(', ')}`;
    case 'includes':
      return `includes one of ${when.values.join(', ')}`;
    case 'at_most':
      return `at most ${when.value}`;
    case 'at_least':
      return `at least ${when.value}`;
    default: {
      const exhaustive: never = when;
      return exhaustive;
    }
  }
}
