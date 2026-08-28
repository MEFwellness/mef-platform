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
 * `./registry.ts` also holds the reusable questionnaire *engine*'s own
 * content mapping (questionnaire.json + copy.ts pairs, for the 3
 * assessments that run on that engine — CHEK HLC1, Four Doctors,
 * Short-HAQ) — formerly a second file, lib/assessments/registry.ts, now
 * absorbed into this one so there is a single assessment registry. Not
 * the same thing as `lib/registry/` (the Universal Health Registry of
 * normalized findings/metrics — an unrelated system despite the name
 * overlap). This registry sits one level above all of that: it's where
 * you'd look to answer "what assessments exist, who can take them, and
 * what are the rules around them" without already knowing which of the
 * five underlying systems implements a given one.
 *
 * Every existing assessment's entry describes its REAL current behavior.
 * Tier gating IS live now: `membership.minLevel` is the one gate, and the
 * full plan map is printed in registry.ts's own header.
 */

/** Stable membership keys. Do not rely on display labels for gating logic. */
export type MembershipKey = 'free_trial' | 'membership' | 'holistic_reset';

/** Stable, display-name-independent keys for every assessment in the product. */
export type AssessmentKey =
  | 'onboarding-health-history'
  | 'chek-hlc1-nutrition-lifestyle'
  | 'four-doctors'
  | 'primal-pattern-diet-type'
  | 'body-assessment'
  /** Coming Soon — catalog row only (00000000000078), no question content, no route. */
  | 'readiness-to-change'
  | 'short-haq'
  | 'finding-1-love'
  /** Whole-Body Systems Assessment — the first real assessment on the Unified Adaptive Assessment Runtime (migrations 98-100). */
  | 'wbsa'
  /** Core Values Snapshot — free-tier Experience 1, also on the Unified Adaptive Assessment Runtime (migration 134). */
  | 'core-values-snapshot'
  /** Life Signal Check — free-tier Experience 2, also on the Unified Adaptive Assessment Runtime (migration 138). Unlocks only after Core Values Snapshot completes, via prerequisites.prerequisiteKeys below. */
  | 'life-signal-check'
  /** Readiness Pulse — free-tier Experience 3, the final conversation of the free arc, also on the Unified Adaptive Assessment Runtime (migration 141). Unlocks only after Life Signal Check completes. Distinct from the older, unrelated 'readiness-to-change' coming-soon placeholder above (catalog row only, no relation to this experience). */
  | 'readiness-pulse';

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
  | 'body-assessment-geometric-screening'
  | 'unified-runtime-findings';

export type ResultAdapterId =
  | 'generic-questionnaire-results'
  | 'four-doctors-premium-results'
  | 'primal-pattern-results'
  | 'onboarding-baseline-reassessment'
  | 'body-assessment-coach-review'
  | 'wbsa-system-pattern-results'
  | 'core-values-snapshot-results'
  | 'life-signal-check-results'
  | 'readiness-pulse-results';

export type StorageAdapterId =
  | 'wellness-assessments-tables'
  | 'primal-pattern-tables'
  | 'onboarding-tables'
  | 'body-assessment-tables'
  | 'unified-assessment-runtime-tables';

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

/**
 * WHAT THIS IS, AND WHAT IT IS NOT (Visibility Layer, 2026-08-17).
 *
 * `prerequisiteKeys` is a real, live, server-enforced ACCESS rule: a member
 * may not open Life Signal Check until Core Values Snapshot is done, and
 * lib/assessment-registry/access.ts refuses her at the server if she tries.
 * It stays exactly as it is. Access is permission, and permission must not
 * depend on a rendering decision.
 *
 * Two free-text siblings used to sit beside it, `unlockRule` and
 * `recommendationRule`. Both were null on all fourteen registered
 * assessments, neither had an evaluator, and together they formed the
 * second of the two competing unlock vocabularies the audit found. They are
 * DELETED rather than left in place, so that no future feature can write a
 * rule into a field nothing reads. Visibility is decided in exactly one
 * place now: lib/visibility/catalog.ts, where every assessment carries a
 * structured, evaluable rule, and where this same prerequisite chain is
 * mirrored as `{ kind: 'completed_assessment' }` so the library shows her
 * the next conversation at the moment she has earned it.
 */
export type PrerequisiteRules = {
  prerequisiteKeys: AssessmentKey[];
};

/**
 * How urgently a moderate/significant finding from this assessment
 * warrants coach attention relative to other assessments — a real,
 * queryable field for the Universal Assessment Intelligence Engine's
 * Root Cause Signals / reassessment-suggestion logic (Prompt 6), not a
 * clinical diagnosis or cert-level distinction. 'high' = Onboarding and
 * Body Assessment (foundational intake / structural screening reviewed by
 * a coach); 'moderate' = the two points-scored questionnaires; 'low' =
 * Primal Pattern (a classification, not a problem-finding instrument) and
 * every not-yet-built Coming Soon placeholder.
 */
export type ClinicalPriority = 'low' | 'moderate' | 'high';

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

  /**
   * THE GATE (Build 2, 2026-08-27). `membership.minLevel` alone decides
   * whether a member may start this. There is deliberately no second
   * `requiresAssignment` flag layered underneath it any more: a field
   * that could only ever subtract access was doing the work the plan map
   * is supposed to do, invisibly, and it is removed rather than defaulted
   * so nothing can switch it back on by accident. A coach assignment is
   * still read, but only ever to ADD access for one member
   * (lib/assessment-registry/status.ts).
   */
  membership: MembershipRules;
  program: ProgramRules;
  prerequisites: PrerequisiteRules;
  /**
   * Assessment Relationships (Prompt 6) — other assessments this one
   * naturally connects to (shown as "you might also find useful," never a
   * fixed required sequence). Distinct from prerequisites.prerequisiteKeys
   * (a dependency/unlock relationship): this is a peer relationship,
   * populated by real product judgment about which instruments cover
   * related ground, same "config in code" discipline as the rest of this
   * registry. The finding-driven version of "what to take next" lives in
   * lib/assessment-registry/findingRecommendations.ts, which reads actual
   * Universal Registry findings rather than this static list — this field
   * is the fallback/general-purpose relationship, not a replacement.
   */
  relatedAssessmentKeys: AssessmentKey[];
  clinicalPriority: ClinicalPriority;
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
