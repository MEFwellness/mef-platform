/**
 * The Visibility Layer — the vocabulary.
 *
 * One place decides what a member can see. Not "does this feature exist",
 * which is a question about the product, but "does this member need this
 * now", which is a question about her.
 *
 * The default is hidden. A thing renders because a rule in this layer says
 * she needs it, never because it was built.
 *
 * Everything here is pure data and pure types. The evaluator is rules.ts,
 * the catalog is catalog.ts, the stored state is data.ts, and the one entry
 * point is service.ts.
 *
 * WHY THIS VOCABULARY AND NOT THE OTHER ONE. Two designed-but-inert unlock
 * systems existed side by side before this build (see BUILD_STATUS for the
 * full reasoning): the structured `UnlockTrigger` union in
 * lib/investigation-engine, and the free-text `unlockRule` /
 * `recommendationRule` string pair on `AssessmentDefinition.prerequisites`.
 * The structured one won, because a string a human reads is not a rule a
 * computer can run, and because the structured one already had a written,
 * tested evaluator. `RevealRule` below is that union, generalized off
 * assessments so a tracker, a card, a hub screen and a follow-up question
 * set can all carry one.
 */

import type { CoachingDomain } from '../investigation-engine/domains';
import type { AssessmentKey } from '../assessment-registry/types';
import type { EvidenceTier } from '../member-interpretation/types';

/**
 * Every thing in the member app whose presence is a decision. Stable
 * strings, because they are written into the database and read back by a
 * coach months later.
 *
 * Naming: `<area>.<thing>`. The area is where it lives, not what it is
 * about, so a coach reading a stored row can find it.
 */
export type FeatureKey = string;

/** What kind of thing this is. Only ever used for grouping a coach's view and for the catalog's own sanity checks. */
export type FeatureKind =
  /** A questionnaire or assessment the member takes. */
  | 'assessment'
  /** Something she logs into, day to day. */
  | 'tracker'
  /** A whole screen or module. */
  | 'feature'
  /** One card or panel on a screen someone else owns. */
  | 'card'
  /** A short set of follow-up questions inside an existing flow. */
  | 'question_set';

/**
 * Which screen an entry point for this feature would appear on. The
 * declutter rule ("no screen may advertise a feature the member's rules
 * have not revealed") is enforced by every one of these surfaces asking
 * this layer before it renders, so this field is documentation and a
 * coach-view grouping rather than a mechanism.
 */
export type SurfaceKey = 'home' | 'today' | 'progress' | 'questionnaires' | 'nav' | 'checkin' | 'none';

/**
 * An answer predicate over one intake question. Deliberately small and
 * closed: a rule that could run arbitrary code over her answers is a rule
 * nobody can audit six months later.
 */
export type AnswerPredicate =
  /** The stored enum / free-text value is one of these. */
  | { op: 'equals'; values: string[] }
  /** A multi-select answer contains at least one of these. */
  | { op: 'includes'; values: string[] }
  /** A numeric answer at or below this. Low numbers are the concerning end of every baseline scale in this app. */
  | { op: 'at_most'; value: number }
  /** A numeric answer at or above this. */
  | { op: 'at_least'; value: number }
  /** Answered at all, with anything. */
  | { op: 'answered' };

/**
 * Things she has actually done. Counted from real rows, never inferred.
 * Each one is a number so a rule can say "at least N" and mean it.
 */
export type BehaviorSignal =
  /** Distinct local dates with a check-in, all time. */
  | 'checkin_days'
  /** Distinct local dates with any movement logged. */
  | 'movement_days'
  /** Food entries logged, all time. */
  | 'food_entries'
  /** Assessments completed, all time. */
  | 'assessments_completed'
  /** Connected wearable devices. */
  | 'wearables_connected'
  /** Days since she created her account. */
  | 'days_since_signup';

/**
 * One reason a feature could be revealed. A feature carries a list of
 * these and any single one being satisfied is enough, which is the same
 * "independently sufficient conditions" shape the retired unlock engine
 * used and the same shape the Priority Card's ladder uses.
 */
export type RevealRule =
  /**
   * Visible from the start, for everyone. Used sparingly and always with a
   * written reason on the catalog entry, because "always" is the answer
   * this whole build exists to stop being the default.
   */
  | { kind: 'always' }
  /**
   * Safety. Exempt from visibility in BOTH directions: it can never be
   * hidden by any rule, by a coach, or by the member, and an open safety
   * concern can reveal anything it needs to. Evaluated before everything.
   */
  | { kind: 'safety' }
  /** She said something at intake. */
  | { kind: 'intake_answer'; questionKey: string; when: AnswerPredicate }
  /** She did something, enough times. */
  | { kind: 'behavior'; signal: BehaviorSignal; atLeast: number }
  /**
   * A canonical finding reached an evidence tier. Reads the interpretation
   * layer's findings and tiers, NEVER raw data, so what she is shown and
   * what she is told can never disagree.
   */
  | {
      kind: 'finding_tier';
      /** Restrict to findings filed under this coaching domain. Omit for any domain. */
      domain?: CoachingDomain;
      /** Restrict to these finding codes (the `code` half of a canonical source key). Omit for any code. */
      codes?: string[];
      minTier: EvidenceTier;
    }
  /**
   * A coaching domain reached a state. Also read from the interpretation
   * layer. Useful where "she has anything at all going on here" is the
   * honest trigger and a specific finding code is not.
   */
  | { kind: 'domain_state'; domain: CoachingDomain; states: readonly string[] }
  /**
   * She completed a prior assessment. This is the one thing the losing
   * prerequisite system uniquely covered, migrated here so no rule has to
   * consult two places. The live server-side access check
   * (lib/assessment-registry/access.ts) still enforces the same fact
   * independently, which is correct: visibility is presentation and access
   * is permission, and permission must not depend on a rendering decision.
   */
  | { kind: 'completed_assessment'; keys: AssessmentKey[] }
  /** A coach assigned it to her. */
  | { kind: 'coach_assigned' };

export type FeatureDefinition = {
  key: FeatureKey;
  kind: FeatureKind;
  surface: SurfaceKey;
  /** Plain name a coach reads on the visibility screen. Never an internal key. */
  label: string;
  /** Who this is genuinely for, in one sentence. Written for the person retuning the rules, not for the member. */
  whoNeedsThis: string;
  /**
   * Any one of these being satisfied reveals it. An empty list means
   * nothing can ever reveal it, which is a real and deliberate answer for
   * a surface being retired.
   */
  revealWhen: RevealRule[];
  /**
   * The one plain sentence the member reads when this is newly revealed,
   * in Root's voice. No jargon, no tier names, no em dashes.
   * Null for a feature that is visible from the start, since nothing was
   * revealed and there is nothing to explain.
   */
  revealSentence: string | null;
  /**
   * Whether starting, completing or logging into this counts as touching
   * it. Everything a member has touched is grandfathered and never
   * disappears (rule 2); this names the probe that decides it.
   */
  touchedBy: TouchProbe;
  /**
   * True when this feature is part of safety monitoring and may never be
   * hidden from anyone, whatever the rules or a coach say.
   */
  safetyCritical?: boolean;
  /**
   * Set when the catalog author could not honestly infer a rule. Defaults
   * the feature to visible and is listed in the report rather than guessed
   * at. Never used to paper over a rule that was simply hard to write.
   */
  couldNotInferRule?: boolean;
};

/**
 * How "she has touched this" is answered for one feature. Every probe is a
 * count already gathered for the visibility context, so grandfathering
 * costs no extra query.
 */
export type TouchProbe =
  /** Nothing to touch. Cards and question sets, mostly. */
  | { kind: 'none' }
  /** She has started or completed one of these assessments. */
  | { kind: 'assessment'; keys: AssessmentKey[] }
  /** A behavior counter is above zero. */
  | { kind: 'behavior'; signal: BehaviorSignal }
  /** She has an active or historical row behind this feature, gathered specially. */
  | { kind: 'signal'; signal: TouchSignal };

/** Per-feature "she has real history here" facts that are not plain counters. */
export type TouchSignal =
  | 'has_reset_plan'
  | 'has_active_experiment'
  | 'has_weekly_review'
  | 'has_root_score_snapshot'
  | 'has_registry_finding'
  | 'has_habit';

/** Why a feature ended up visible or hidden. Stored, and shown to a coach. */
export type VisibilitySource =
  /** A reveal rule fired. */
  | 'rule'
  /** A coach revealed or hid it by hand. Wins over everything except safety. */
  | 'coach'
  /** The member hid it herself. */
  | 'member'
  /** She had already touched it when the rules arrived, so it stayed. */
  | 'grandfathered'
  /** The existing-member migration resolved it. */
  | 'migration'
  /** Safety. Cannot be overridden in either direction. */
  | 'safety';

export type VisibilityState = 'revealed' | 'hidden';

/** One feature's answer for one member, with the whole reason chain. */
export type FeatureVisibility = {
  key: FeatureKey;
  label: string;
  kind: FeatureKind;
  surface: SurfaceKey;
  visible: boolean;
  source: VisibilitySource;
  /** Which rule kind produced this, when a rule did. Null otherwise. Never rendered to a member. */
  ruleKind: RevealRule['kind'] | null;
  /** The member-facing sentence, when there is one to show. */
  revealSentence: string | null;
  /** Plain-language explanation for the coach's screen. Always present. */
  coachExplanation: string;
  /** True when she has real history here and it is being kept for that reason. */
  grandfathered: boolean;
  /** True when this reveal has not been shown to her yet. */
  newlyRevealed: boolean;
  revealedAt: string | null;
};

/** Everything the layer knows about one member's app, computed once per request. */
export type MemberVisibility = {
  /** Every feature in the catalog, with its answer. */
  features: FeatureVisibility[];
  /** Fast lookup, same objects. */
  byKey: Map<FeatureKey, FeatureVisibility>;
  /** Newly revealed and not yet acknowledged, in catalog order. What the member reads one sentence about. */
  newlyRevealed: FeatureVisibility[];
  /** True when an open safety review is in force for this member. */
  safetyActive: boolean;
};

/** The one question every surface asks. */
export function isVisible(visibility: MemberVisibility, key: FeatureKey): boolean {
  return visibility.byKey.get(key)?.visible ?? false;
}
