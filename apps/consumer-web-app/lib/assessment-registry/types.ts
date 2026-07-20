/**
 * Assessment Registry — types.
 *
 * This is a cross-cutting metadata layer describing every assessment
 * system in the product (Onboarding, CHEK HLC1, Four Doctors, Primal
 * Pattern, Body Assessment) in one place, for concerns that today are
 * scattered or implicit: membership gating, program phase, retake/
 * reassessment rules, result-access rules, and UI wiring (route/result
 * route/copy references).
 *
 * This is deliberately NOT a replacement for `lib/assessments/registry.ts`
 * (the reusable questionnaire *engine*'s own registry of
 * questionnaire.json + copy.ts pairs — that keeps working exactly as-is
 * for CHEK HLC1/Four Doctors) and NOT the same thing as `lib/registry/`
 * (the Universal Health Registry of normalized findings/metrics — an
 * unrelated system despite the name overlap). This registry sits one
 * level above all of that: it's where you'd look to answer "what
 * assessments exist, who can take them, and what are the rules around
 * them" without already knowing which of the five underlying systems
 * implements a given one.
 *
 * Every existing assessment's entry below describes its REAL current
 * behavior, not aspirational/future behavior — e.g. every existing
 * assessment is currently reachable by any authenticated member (there is
 * no subscription/tier gating live today, per the inventory), so every
 * existing entry's `membership.allowedLevels` includes all three levels.
 * Tightening that is a product decision for a later task, not something
 * encoded here as a side effect of adding the type.
 */

/** Stable membership keys. Do not rely on display labels for gating logic. */
export type MembershipKey = 'free_trial' | 'membership' | 'holistic_reset';

/** Stable, display-name-independent keys for every assessment in the product. */
export type AssessmentKey =
  | 'onboarding-health-history'
  | 'chek-hlc1-nutrition-lifestyle'
  | 'four-doctors'
  | 'primal-pattern-diet-type'
  | 'body-assessment';

export type AssessmentType =
  /** Structured Q&A, scored, single-select-with-points (the reusable engine's own model). */
  | 'points_scored_questionnaire'
  /** Structured Q&A, no point score — raw answers + comparator (Onboarding). */
  | 'intake_questionnaire'
  /** Structured Q&A, rule-based classification, letter-select answers (Primal Pattern). */
  | 'classification_questionnaire'
  /** Guided media capture + geometric/AI review, not question/answer (Body Assessment). */
  | 'media_capture_review';

export type ImplementationStatus = 'live' | 'planned' | 'coming_soon';

export type SafetyCategory =
  | 'none'
  /** Free-text/health-history fields that already route through member_nutrition_safety_flags-style review. */
  | 'clinical_intake'
  /** Physical movement capture — camera guidance, injury-risk framing. */
  | 'movement_screening';

/**
 * Which module actually computes/stores this assessment's scoring, results,
 * and persistence. Identifiers, not direct function imports — this file
 * must stay a lightweight, tree-shakeable config module that every server
 * and client surface can import without pulling in server-only engine code.
 * The `moduleRef` comment on each entry is for engineering traceability,
 * not something code resolves at runtime.
 */
export type ScoringAdapterId =
  | 'none'
  | 'generic-questionnaire-engine'
  | 'primal-pattern-engine'
  | 'onboarding-comparator'
  | 'body-assessment-geometric-screening';

export type ResultAdapterId =
  | 'generic-questionnaire-results'
  | 'four-doctors-premium-results'
  | 'primal-pattern-results'
  | 'onboarding-baseline-reassessment'
  | 'body-assessment-coach-review';

export type StorageAdapterId =
  | 'wellness-assessments-tables'
  | 'primal-pattern-tables'
  | 'onboarding-tables'
  | 'body-assessment-tables';

export type MembershipRules = {
  minLevel: MembershipKey;
  allowedLevels: MembershipKey[];
};

export type ProgramRules = {
  programOnly: boolean;
  /** Stable program key (see programs catalog), null when programOnly is false. */
  programKey: string | null;
  /** Stable phase key within that program, null when not phase-gated. */
  programPhase: string | null;
  phaseOrder: number | null;
};

export type PrerequisiteRules = {
  prerequisiteKeys: AssessmentKey[];
  /** Free-text description of any unlock condition beyond "prerequisite completed" — no runtime logic implied yet. */
  unlockRule: string | null;
  /** Free-text description of when this assessment should be recommended to a member — no runtime logic implied yet. */
  recommendationRule: string | null;
};

export type CoachRules = {
  approvalRequired: boolean;
  assignmentSupported: boolean;
  /** Whether a completed attempt should be routed into a coach review queue before a member sees results. */
  coachReviewRequired: boolean;
};

export type RetakeRules = {
  retakeAllowed: boolean;
  /** 0 = no cooldown (current behavior for every existing assessment). */
  retakeWaitingPeriodDays: number;
};

export type ReassessmentRules = {
  supportsReassessment: boolean;
  /** e.g. ['baseline', 'reassessment'] for Onboarding today. Empty when supportsReassessment is false. */
  stages: string[];
  /** Free-text description of cadence (e.g. "member-initiated, no fixed schedule"). Null when supportsReassessment is false. */
  schedule: string | null;
};

export type ComparisonRules = {
  supportsSimpleHistory: boolean;
  supportsScoreTrend: boolean;
  supportsSideBySideComparison: boolean;
  supportsQuestionLevelComparison: boolean;
};

export type ResultAccessRules = {
  memberCanView: boolean;
  /** Gated behind a published coach review before the member can view (mirrors Body Assessment's assessment_ai_analyses gate). */
  requiresCoachPublishToView: boolean;
  coachCanView: boolean;
  adminCanView: boolean;
};

export type AssessmentDefinition = {
  /** Fixed UUID, stable across environments — matches assessment_definitions.id. */
  databaseId: string;
  /** Stable, display-name-independent key — matches assessment_definitions.key and, where one already existed, the system's own questionnaire_id/literal. */
  key: AssessmentKey;
  type: AssessmentType;

  displayName: string;
  shortDescription: string;
  category: string;
  estimatedMinutes: number;

  membership: MembershipRules;
  program: ProgramRules;
  prerequisites: PrerequisiteRules;
  coach: CoachRules;
  retake: RetakeRules;
  reassessment: ReassessmentRules;
  comparison: ComparisonRules;
  resultAccess: ResultAccessRules;

  /** Current content/scoring version in effect. Matches the system's own version column where one exists. */
  currentVersion: number;
  /** If true, an attempt's stored version must match currentVersion for its result to be treated as current (no system enforces this yet — see ASSESSMENT_INVENTORY.md risk list, item 11). */
  versionLockingRequired: boolean;

  isActive: boolean;
  implementationStatus: ImplementationStatus;
  isComingSoon: boolean;

  route: string;
  /** Null when the take flow is not a route-driven wizard (n/a for none today). */
  takeRoute: string | null;
  resultRoute: string;
  /** Component or adapter reference, as a source-relative path — traceability only, not imported here. */
  componentRef: string;
  /** Where member-facing intro/welcome copy for this assessment lives. */
  introCopyRef: string;

  scoringAdapter: ScoringAdapterId;
  resultAdapter: ResultAdapterId;
  storageAdapter: StorageAdapterId;

  displayOrder: number;
  safetyCategory: SafetyCategory;
};
