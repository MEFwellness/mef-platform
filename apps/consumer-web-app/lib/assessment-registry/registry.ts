/**
 * Assessment Registry — entries.
 *
 * One entry per assessment system, describing its REAL current behavior
 * (see the header comment in ./types.ts for why every existing entry is
 * membership-permissive and program-ungated). Adding a sixth assessment
 * system means adding a definition here plus a matching
 * `assessment_definitions` catalog row (see
 * supabase/migrations/00000000000070_assessment_registry_catalog.sql) —
 * it does not require touching any existing entry.
 *
 * These UUIDs are fixed and must match the seed data in
 * 00000000000070_assessment_registry_catalog.sql exactly — they are not
 * generated at runtime, so every environment (local, staging, production)
 * resolves the same assessment to the same database id.
 *
 * Also home to the questionnaire *content* mapping (Questionnaire + Copy
 * pairs) for the 3 assessments that run on the reusable generic engine —
 * absorbed from the former lib/assessments/registry.ts so there is one
 * assessment registry, not two. See the "Questionnaire content mapping"
 * section near the bottom of this file. Consolidation only: nothing about
 * how any of the 9 assessments behaves changed.
 */

import type { AssessmentDefinition, AssessmentKey } from './types';
import type { AssessmentDefinition as AssessmentContentDefinition } from '../assessments/engine/types';
import { CHEK_HLC1_QUESTIONNAIRE } from '../assessments/chek-hlc1';
import { CHEK_HLC1_COPY } from '../assessments/chek-hlc1/copy';
import { FOUR_DOCTORS_QUESTIONNAIRE } from '../assessments/four-doctors';
import { FOUR_DOCTORS_COPY } from '../assessments/four-doctors/copy';
import { SHORT_HAQ_QUESTIONNAIRE } from '../assessments/short-haq';
import { SHORT_HAQ_COPY } from '../assessments/short-haq/copy';

const ONBOARDING: AssessmentDefinition = {
  databaseId: '6b86f205-a75b-452f-b926-4c5dffc29baa',
  key: 'onboarding-health-history',
  type: 'intake_questionnaire',

  displayName: 'Onboarding Assessment',
  shortDescription:
    'Health history and lifestyle intake completed at signup, with unlimited reassessments.',
  category: 'health_history',
  estimatedMinutes: 15,

  membership: {
    minLevel: 'free_trial',
    allowedLevels: ['free_trial', 'membership', 'holistic_reset'],
  },
  requiresAssignment: false,
  program: { programOnly: false, programKey: null, programPhase: null, phaseOrder: null },
  prerequisites: { prerequisiteKeys: [], unlockRule: null, recommendationRule: null },
  relatedAssessmentKeys: ['chek-hlc1-nutrition-lifestyle', 'four-doctors', 'body-assessment'],
  clinicalPriority: 'high',
  coach: { approvalRequired: false, assignmentSupported: true, coachReviewRequired: false },
  retake: { retakeAllowed: true, retakeWaitingPeriodDays: 0 },
  reassessment: {
    supportsReassessment: true,
    stages: ['baseline', 'reassessment'],
    schedule:
      'Member-initiated, no fixed cadence enforced today (checkpoint_label 30/90-day columns exist but are unread).',
  },
  comparison: {
    supportsSimpleHistory: true,
    supportsScoreTrend: false,
    supportsSideBySideComparison: true,
    supportsQuestionLevelComparison: true,
  },
  resultAccess: {
    memberCanView: true,
    requiresCoachPublishToView: false,
    coachCanView: true,
    adminCanView: true,
  },

  currentVersion: 1,
  versionLockingRequired: false,

  isActive: true,
  implementationStatus: 'live',
  isComingSoon: false,

  route: '/onboarding',
  takeRoute: '/onboarding',
  resultRoute: '/profile/reassessments/new',
  componentRef: 'app/onboarding/OnboardingForm.tsx',
  introCopyRef: 'app/onboarding/ConsentForm.tsx',

  scoringAdapter: 'onboarding-comparator',
  resultAdapter: 'onboarding-baseline-reassessment',
  storageAdapter: 'onboarding-tables',

  displayOrder: 1,
  safetyCategory: 'clinical_intake',
};

const CHEK_HLC1: AssessmentDefinition = {
  databaseId: '4305b5a8-0c0c-40b5-ab8a-7d0b2a9cb7b9',
  key: 'chek-hlc1-nutrition-lifestyle',
  type: 'points_scored_questionnaire',

  displayName: 'Nutrition & Lifestyle Questionnaire',
  shortDescription:
    'A 91-question, 7-category nutrition and lifestyle questionnaire with category-level priority scoring.',
  category: 'nutrition_lifestyle',
  estimatedMinutes: 20,

  // Free / 7-Day Trial's one complete entry-point assessment is Four
  // Doctors (see FOUR_DOCTORS below) — per the membership framework, the
  // Nutrition & Lifestyle Questionnaire is a Membership-tier observational
  // assessment, not part of the free entry point. Every existing free
  // member's data/history is unaffected: this only changes what a free
  // member can *newly start* going forward (enforced in
  // lib/assessment-registry/access.ts), never anything already completed.
  membership: { minLevel: 'membership', allowedLevels: ['membership', 'holistic_reset'] },
  requiresAssignment: true,
  program: { programOnly: false, programKey: null, programPhase: null, phaseOrder: null },
  prerequisites: { prerequisiteKeys: [], unlockRule: null, recommendationRule: null },
  relatedAssessmentKeys: ['primal-pattern-diet-type', 'four-doctors'],
  clinicalPriority: 'moderate',
  coach: { approvalRequired: false, assignmentSupported: true, coachReviewRequired: false },
  retake: { retakeAllowed: true, retakeWaitingPeriodDays: 0 },
  reassessment: {
    supportsReassessment: true,
    stages: [],
    schedule:
      'Unlimited retakes, no cooldown or expiry, by explicit product decision — a retake is just a new attempt row.',
  },
  comparison: {
    supportsSimpleHistory: true,
    supportsScoreTrend: true,
    supportsSideBySideComparison: false,
    supportsQuestionLevelComparison: false,
  },
  resultAccess: {
    memberCanView: true,
    requiresCoachPublishToView: false,
    coachCanView: true,
    adminCanView: true,
  },

  currentVersion: 1,
  versionLockingRequired: false,

  isActive: true,
  implementationStatus: 'live',
  isComingSoon: false,

  route: '/assessments/nutrition-lifestyle',
  takeRoute: '/assessments/nutrition-lifestyle/take',
  resultRoute: '/assessments/nutrition-lifestyle/results/[assessmentId]',
  componentRef: 'components/assessments/AssessmentTaker.tsx',
  introCopyRef: 'lib/assessments/chek-hlc1/copy.ts',

  scoringAdapter: 'generic-questionnaire-engine',
  resultAdapter: 'generic-questionnaire-results',
  storageAdapter: 'wellness-assessments-tables',

  displayOrder: 2,
  safetyCategory: 'none',
};

const FOUR_DOCTORS: AssessmentDefinition = {
  databaseId: 'b67e32f5-ccdd-42b0-b7c2-2eb09431bc72',
  key: 'four-doctors',
  type: 'points_scored_questionnaire',

  displayName: 'Four Doctors Assessment',
  shortDescription:
    'A 54-question, 4-category binary questionnaire covering movement, nutrition, breathing, and rest.',
  category: 'holistic_balance',
  estimatedMinutes: 12,

  membership: {
    minLevel: 'free_trial',
    allowedLevels: ['free_trial', 'membership', 'holistic_reset'],
  },
  requiresAssignment: true,
  program: { programOnly: false, programKey: null, programPhase: null, phaseOrder: null },
  prerequisites: { prerequisiteKeys: [], unlockRule: null, recommendationRule: null },
  relatedAssessmentKeys: ['body-assessment', 'chek-hlc1-nutrition-lifestyle'],
  clinicalPriority: 'moderate',
  coach: { approvalRequired: false, assignmentSupported: true, coachReviewRequired: false },
  retake: { retakeAllowed: true, retakeWaitingPeriodDays: 0 },
  reassessment: {
    supportsReassessment: true,
    stages: [],
    schedule: 'Unlimited retakes, no cooldown or expiry — same engine/behavior as CHEK HLC1.',
  },
  comparison: {
    supportsSimpleHistory: true,
    supportsScoreTrend: true,
    supportsSideBySideComparison: false,
    supportsQuestionLevelComparison: false,
  },
  resultAccess: {
    memberCanView: true,
    requiresCoachPublishToView: false,
    coachCanView: true,
    adminCanView: true,
  },

  currentVersion: 1,
  versionLockingRequired: false,

  isActive: true,
  implementationStatus: 'live',
  isComingSoon: false,

  route: '/assessments/four-doctors',
  takeRoute: '/assessments/four-doctors/take',
  resultRoute: '/assessments/four-doctors/results/[assessmentId]',
  componentRef: 'components/assessments/AssessmentTaker.tsx',
  introCopyRef: 'lib/assessments/four-doctors/copy.ts',

  scoringAdapter: 'generic-questionnaire-engine',
  resultAdapter: 'four-doctors-premium-results',
  storageAdapter: 'wellness-assessments-tables',

  displayOrder: 3,
  safetyCategory: 'none',
};

const PRIMAL_PATTERN: AssessmentDefinition = {
  databaseId: '524ed776-dad6-4584-8e0d-075a3ab76727',
  key: 'primal-pattern-diet-type',
  type: 'classification_questionnaire',

  displayName: 'Primal Pattern Diet Type',
  shortDescription:
    'A 14-question letter-select instrument classifying dietary pattern as polar, variable, or equatorial.',
  category: 'nutrition_lifestyle',
  estimatedMinutes: 8,

  membership: {
    minLevel: 'free_trial',
    allowedLevels: ['free_trial', 'membership', 'holistic_reset'],
  },
  requiresAssignment: true,
  program: { programOnly: false, programKey: null, programPhase: null, phaseOrder: null },
  prerequisites: { prerequisiteKeys: [], unlockRule: null, recommendationRule: null },
  relatedAssessmentKeys: ['chek-hlc1-nutrition-lifestyle'],
  clinicalPriority: 'low',
  coach: { approvalRequired: false, assignmentSupported: true, coachReviewRequired: false },
  retake: { retakeAllowed: true, retakeWaitingPeriodDays: 0 },
  reassessment: {
    supportsReassessment: true,
    stages: [],
    schedule: 'Unlimited retakes, no cooldown or expiry.',
  },
  comparison: {
    supportsSimpleHistory: true,
    supportsScoreTrend: false,
    supportsSideBySideComparison: false,
    supportsQuestionLevelComparison: false,
  },
  resultAccess: {
    memberCanView: true,
    requiresCoachPublishToView: false,
    coachCanView: true,
    adminCanView: true,
  },

  currentVersion: 1,
  versionLockingRequired: false,

  isActive: true,
  implementationStatus: 'live',
  isComingSoon: false,

  route: '/assessments/primal-pattern-diet-type',
  takeRoute: '/assessments/primal-pattern-diet-type/take',
  resultRoute: '/assessments/primal-pattern-diet-type/results/[assessmentId]',
  componentRef: 'components/primal-pattern/PrimalPatternTaker.tsx',
  introCopyRef: 'lib/primal-pattern/premium/content.ts',

  scoringAdapter: 'primal-pattern-engine',
  resultAdapter: 'primal-pattern-results',
  storageAdapter: 'primal-pattern-tables',

  displayOrder: 4,
  safetyCategory: 'none',
};

const BODY_ASSESSMENT: AssessmentDefinition = {
  databaseId: '6c071b7d-ca9a-4f52-a7c0-87ae69de726b',
  key: 'body-assessment',
  type: 'media_capture_review',

  displayName: 'Body Assessment',
  shortDescription:
    'Guided camera-based posture and movement capture (static posture, gait, mobility, and more), reviewed by a coach.',
  category: 'movement',
  estimatedMinutes: 10,

  membership: {
    minLevel: 'free_trial',
    allowedLevels: ['free_trial', 'membership', 'holistic_reset'],
  },
  // Coach-Assign-Only Gating task (2026-08-04): a proprietary coaching
  // tool, same as Four Doctors/CHEK HLC1/Primal Pattern/Short-HAQ/WBSA
  // above — a free member must never be able to open the camera-based
  // capture flow on their own. Enforced the same way every other gated
  // entry is: calculateLockReason/checkAssessmentAccess already treat
  // requiresAssignment generically, so no new gating machinery was
  // needed, only this flag flip plus removing this key's exclusion from
  // listAssignableAssessments below.
  requiresAssignment: true,
  program: { programOnly: false, programKey: null, programPhase: null, phaseOrder: null },
  prerequisites: { prerequisiteKeys: [], unlockRule: null, recommendationRule: null },
  relatedAssessmentKeys: ['four-doctors', 'onboarding-health-history'],
  clinicalPriority: 'high',
  coach: { approvalRequired: false, assignmentSupported: true, coachReviewRequired: true },
  retake: { retakeAllowed: true, retakeWaitingPeriodDays: 0 },
  reassessment: {
    supportsReassessment: true,
    stages: [],
    schedule:
      'Implicit only — "previous" is computed live as the most recent same-type assessment, no explicit baseline/reassessment marker.',
  },
  comparison: {
    supportsSimpleHistory: true,
    supportsScoreTrend: false,
    supportsSideBySideComparison: true,
    supportsQuestionLevelComparison: false,
  },
  resultAccess: {
    memberCanView: true,
    requiresCoachPublishToView: true,
    coachCanView: true,
    adminCanView: true,
  },

  currentVersion: 1,
  versionLockingRequired: false,

  isActive: true,
  implementationStatus: 'live',
  isComingSoon: false,

  route: '/assessment',
  takeRoute: '/assessment/new',
  resultRoute: '/assessment/[id]',
  componentRef: 'components/body-assessment/AssessmentWizard.tsx',
  introCopyRef: 'lib/body-assessment/assessmentTypes.ts',

  scoringAdapter: 'body-assessment-geometric-screening',
  resultAdapter: 'body-assessment-coach-review',
  storageAdapter: 'body-assessment-tables',

  displayOrder: 5,
  safetyCategory: 'movement_screening',
};

/**
 * Coming Soon placeholders — catalog rows exist (migration 78), no
 * question content, no route, no scoring adapter. `route`/`resultRoute`
 * are non-null only because the type requires a string; the Questionnaires
 * page never renders these as a link (it checks `isComingSoon` first) so
 * the placeholder value is never actually navigated to. See section 11 of
 * the framework: a placeholder must never open a missing route, start an
 * incomplete assessment, or claim to be personalized.
 */
function comingSoon(config: {
  databaseId: string;
  key: AssessmentKey;
  displayName: string;
  shortDescription: string;
  category: string;
  displayOrder: number;
}): AssessmentDefinition {
  return {
    databaseId: config.databaseId,
    key: config.key,
    type: 'intake_questionnaire',

    displayName: config.displayName,
    shortDescription: config.shortDescription,
    category: config.category,
    estimatedMinutes: 0,

    membership: { minLevel: 'membership', allowedLevels: ['membership', 'holistic_reset'] },
    requiresAssignment: true,
    program: { programOnly: false, programKey: null, programPhase: null, phaseOrder: null },
    prerequisites: { prerequisiteKeys: [], unlockRule: null, recommendationRule: null },
    // No real content exists yet for any Coming Soon placeholder — a
    // relationship/priority claim would be invented, not real, so every
    // placeholder gets the same neutral defaults until it actually ships.
    relatedAssessmentKeys: [],
    clinicalPriority: 'low',
    coach: { approvalRequired: false, assignmentSupported: false, coachReviewRequired: false },
    retake: { retakeAllowed: false, retakeWaitingPeriodDays: 0 },
    reassessment: { supportsReassessment: false, stages: [], schedule: null },
    comparison: {
      supportsSimpleHistory: false,
      supportsScoreTrend: false,
      supportsSideBySideComparison: false,
      supportsQuestionLevelComparison: false,
    },
    resultAccess: {
      memberCanView: false,
      requiresCoachPublishToView: false,
      coachCanView: false,
      adminCanView: true,
    },

    currentVersion: 0,
    versionLockingRequired: false,

    isActive: false,
    implementationStatus: 'coming_soon',
    isComingSoon: true,

    route: '/questionnaires',
    takeRoute: null,
    resultRoute: '/questionnaires',
    componentRef: 'n/a — not yet implemented',
    introCopyRef: 'n/a — not yet implemented',

    scoringAdapter: 'none',
    resultAdapter: 'generic-questionnaire-results',
    storageAdapter: 'wellness-assessments-tables',

    displayOrder: config.displayOrder,
    safetyCategory: 'none',
  };
}

const READINESS_TO_CHANGE = comingSoon({
  databaseId: 'a2d5570d-cd03-49ed-af95-5c99a6a2783f',
  key: 'readiness-to-change',
  displayName: 'Readiness to Change',
  shortDescription:
    'A short reflection on how ready you feel to take on a new habit change right now.',
  category: 'behavior_change',
  displayOrder: 6,
});

const SHORT_HAQ: AssessmentDefinition = {
  databaseId: 'f34fae60-88ba-45d0-8a51-7b7f1776bff4',
  key: 'short-haq',
  type: 'points_scored_questionnaire',

  displayName: 'Short Health Assessment Questionnaire',
  shortDescription:
    'A 56-question, 9-category symptom-frequency check-in across digestion, energy, sleep, stress, immunity, movement, circulation, focus, and hormonal balance.',
  category: 'health_history',
  estimatedMinutes: 12,

  membership: {
    minLevel: 'free_trial',
    allowedLevels: ['free_trial', 'membership', 'holistic_reset'],
  },
  requiresAssignment: true,
  program: { programOnly: false, programKey: null, programPhase: null, phaseOrder: null },
  prerequisites: { prerequisiteKeys: [], unlockRule: null, recommendationRule: null },
  relatedAssessmentKeys: ['onboarding-health-history', 'four-doctors'],
  clinicalPriority: 'moderate',
  coach: { approvalRequired: false, assignmentSupported: true, coachReviewRequired: false },
  retake: { retakeAllowed: true, retakeWaitingPeriodDays: 0 },
  reassessment: {
    supportsReassessment: true,
    stages: [],
    schedule: 'Unlimited retakes, no cooldown or expiry — same engine/behavior as CHEK HLC1 and Four Doctors.',
  },
  comparison: {
    supportsSimpleHistory: true,
    supportsScoreTrend: true,
    supportsSideBySideComparison: false,
    supportsQuestionLevelComparison: false,
  },
  resultAccess: {
    memberCanView: true,
    requiresCoachPublishToView: false,
    coachCanView: true,
    adminCanView: true,
  },

  currentVersion: 1,
  versionLockingRequired: false,

  isActive: true,
  implementationStatus: 'live',
  isComingSoon: false,

  route: '/assessments/short-haq',
  takeRoute: '/assessments/short-haq/take',
  resultRoute: '/assessments/short-haq/results/[assessmentId]',
  componentRef: 'components/assessments/AssessmentTaker.tsx',
  introCopyRef: 'lib/assessments/short-haq/copy.ts',

  scoringAdapter: 'generic-questionnaire-engine',
  resultAdapter: 'generic-questionnaire-results',
  storageAdapter: 'wellness-assessments-tables',

  displayOrder: 7,
  safetyCategory: 'none',
};

const FINDING_1_LOVE = comingSoon({
  databaseId: '6b792a3c-b2ea-4b3d-b272-1142798641fb',
  key: 'finding-1-love',
  displayName: 'Finding 1 Love',
  shortDescription: 'A self-reflection questionnaire on nourishing the relationship with yourself.',
  category: 'nutrition_lifestyle',
  displayOrder: 8,
});

/**
 * Whole-Body Systems Assessment — the first real content on the Unified
 * Adaptive Assessment Foundation/Runtime (migrations 98-100), rather than
 * the older generic questionnaire engine every other live points-scored
 * assessment above uses. `databaseId` matches migration 100's
 * assessment_definitions insert exactly, which in turn is the
 * catalog_definition_id every WBSA unified_assessment_definitions row
 * bridges back to (migration 101).
 *
 * Gated to paid tiers only at launch (membership + holistic_reset, no
 * free_trial) — a deliberate product decision for this deep, 16-body-
 * system instrument, not a technical default. Not program-gated, no
 * prerequisites: WBSA stands alone as a whole-body check-in any paid
 * member can take when they choose to.
 */
const WBSA: AssessmentDefinition = {
  databaseId: 'bfb52589-7566-4347-95aa-03d696a1041e',
  key: 'wbsa',
  type: 'intake_questionnaire',

  displayName: 'Whole-Body Systems Assessment',
  shortDescription:
    'A whole-body check-in across 16 connected functional systems: digestion, energy, immune, circulation, hormones, mood, and more, to help surface patterns worth a closer look.',
  category: 'whole_body_systems',
  estimatedMinutes: 20,

  membership: { minLevel: 'membership', allowedLevels: ['membership', 'holistic_reset'] },
  requiresAssignment: true,
  program: { programOnly: false, programKey: null, programPhase: null, phaseOrder: null },
  prerequisites: { prerequisiteKeys: [], unlockRule: null, recommendationRule: null },
  relatedAssessmentKeys: ['onboarding-health-history', 'four-doctors', 'chek-hlc1-nutrition-lifestyle'],
  clinicalPriority: 'moderate',
  coach: { approvalRequired: false, assignmentSupported: true, coachReviewRequired: false },
  retake: { retakeAllowed: true, retakeWaitingPeriodDays: 0 },
  reassessment: {
    supportsReassessment: true,
    stages: ['baseline', 'reassessment'],
    schedule: 'Member-initiated retake, no fixed cadence — same as every other live assessment today.',
  },
  comparison: {
    supportsSimpleHistory: true,
    supportsScoreTrend: false,
    supportsSideBySideComparison: true,
    supportsQuestionLevelComparison: false,
  },
  resultAccess: {
    memberCanView: true,
    requiresCoachPublishToView: false,
    coachCanView: true,
    adminCanView: true,
  },

  currentVersion: 1,
  versionLockingRequired: false,

  isActive: true,
  implementationStatus: 'live',
  isComingSoon: false,

  route: '/assessments/wbsa',
  takeRoute: '/assessments/wbsa/take',
  resultRoute: '/assessments/wbsa/results/[sessionId]',
  componentRef: 'components/wbsa/WbsaTaker.tsx',
  introCopyRef: 'lib/wbsa/copy.ts',

  scoringAdapter: 'unified-runtime-findings',
  resultAdapter: 'wbsa-system-pattern-results',
  storageAdapter: 'unified-assessment-runtime-tables',

  displayOrder: 9,
  safetyCategory: 'clinical_intake',
};

/**
 * Core Values Snapshot — free-tier Experience 1 (migration 134), the
 * second real content on the Unified Adaptive Assessment Foundation/
 * Runtime after WBSA. Unlike WBSA, this is deliberately free (`minLevel:
 * 'free_trial'`) and produces zero Universal Registry findings by design
 * (a values/preference instrument, not a symptom instrument — see the
 * migration's own header comment) — its "results" are entirely computed
 * client/server-side from the session's own answers
 * (lib/core-values-snapshot/scoring.ts), not from DerivedFinding[].
 */
const CORE_VALUES_SNAPSHOT: AssessmentDefinition = {
  databaseId: 'f852e76a-75cc-441c-9c76-252f5c881a86',
  key: 'core-values-snapshot',
  type: 'intake_questionnaire',

  displayName: 'Core Values Snapshot',
  shortDescription:
    'Twelve questions that surface which of six value areas matters most to you right now, and whether your last two weeks actually protected it.',
  category: 'values_alignment',
  estimatedMinutes: 7,

  membership: {
    minLevel: 'free_trial',
    allowedLevels: ['free_trial', 'membership', 'holistic_reset'],
  },
  requiresAssignment: false,
  program: { programOnly: false, programKey: null, programPhase: null, phaseOrder: null },
  prerequisites: { prerequisiteKeys: [], unlockRule: null, recommendationRule: null },
  relatedAssessmentKeys: [],
  clinicalPriority: 'low',
  coach: { approvalRequired: false, assignmentSupported: true, coachReviewRequired: false },
  retake: { retakeAllowed: true, retakeWaitingPeriodDays: 0 },
  reassessment: {
    supportsReassessment: true,
    stages: [],
    schedule: 'Member-initiated retake, no fixed cadence — same as every other live assessment today.',
  },
  comparison: {
    supportsSimpleHistory: true,
    supportsScoreTrend: false,
    supportsSideBySideComparison: false,
    supportsQuestionLevelComparison: false,
  },
  resultAccess: {
    memberCanView: true,
    requiresCoachPublishToView: false,
    coachCanView: true,
    adminCanView: true,
  },

  currentVersion: 1,
  versionLockingRequired: false,

  isActive: true,
  implementationStatus: 'live',
  isComingSoon: false,

  route: '/assessments/core-values-snapshot',
  takeRoute: '/assessments/core-values-snapshot/take',
  resultRoute: '/assessments/core-values-snapshot/results/[sessionId]',
  componentRef: 'components/core-values-snapshot/CoreValuesSnapshotTaker.tsx',
  introCopyRef: 'lib/core-values-snapshot/copy.ts',

  scoringAdapter: 'unified-runtime-findings',
  resultAdapter: 'core-values-snapshot-results',
  storageAdapter: 'unified-assessment-runtime-tables',

  displayOrder: 0,
  safetyCategory: 'none',
};

/**
 * Life Signal Check — free-tier Experience 2 (migration 138), the third
 * real content on the Unified Adaptive Assessment Foundation/Runtime.
 * Deliberately free, same as Core Values Snapshot, and produces zero
 * Universal Registry findings by design (a listening instrument, not a
 * symptom instrument). Unlike every other entry above,
 * prerequisites.prerequisiteKeys is genuinely populated here — the first
 * assessment to actually use that pre-existing field rather than leave it
 * an empty array. lib/assessment-registry/access.ts and ./catalog.ts
 * compute completedPrerequisiteKeys from real per-member facts, so this
 * is real, server-enforced gating, not a UI-only lock.
 */
const LIFE_SIGNAL_CHECK: AssessmentDefinition = {
  databaseId: 'e784c029-0d1c-4f31-afc2-4c6c2e97e320',
  key: 'life-signal-check',
  type: 'intake_questionnaire',

  displayName: 'Life Signal Check',
  shortDescription:
    'Eleven questions that listen for where your life is speaking the loudest right now, across energy, sleep, tension, digestion, body, and mind.',
  category: 'body_signals',
  estimatedMinutes: 4,

  membership: {
    minLevel: 'free_trial',
    allowedLevels: ['free_trial', 'membership', 'holistic_reset'],
  },
  requiresAssignment: false,
  program: { programOnly: false, programKey: null, programPhase: null, phaseOrder: null },
  prerequisites: { prerequisiteKeys: ['core-values-snapshot'], unlockRule: null, recommendationRule: null },
  relatedAssessmentKeys: ['core-values-snapshot'],
  clinicalPriority: 'low',
  coach: { approvalRequired: false, assignmentSupported: true, coachReviewRequired: false },
  retake: { retakeAllowed: true, retakeWaitingPeriodDays: 0 },
  reassessment: {
    supportsReassessment: true,
    stages: [],
    schedule: 'Member-initiated retake, no fixed cadence — same as every other live assessment today.',
  },
  comparison: {
    supportsSimpleHistory: true,
    supportsScoreTrend: false,
    supportsSideBySideComparison: false,
    supportsQuestionLevelComparison: false,
  },
  resultAccess: {
    memberCanView: true,
    requiresCoachPublishToView: false,
    coachCanView: true,
    adminCanView: true,
  },

  currentVersion: 1,
  versionLockingRequired: false,

  isActive: true,
  implementationStatus: 'live',
  isComingSoon: false,

  route: '/assessments/life-signal-check',
  takeRoute: '/assessments/life-signal-check/take',
  resultRoute: '/assessments/life-signal-check/results/[sessionId]',
  componentRef: 'components/life-signal-check/LifeSignalCheckTaker.tsx',
  introCopyRef: 'lib/life-signal-check/copy.ts',

  scoringAdapter: 'unified-runtime-findings',
  resultAdapter: 'life-signal-check-results',
  storageAdapter: 'unified-assessment-runtime-tables',

  displayOrder: 0.5,
  safetyCategory: 'none',
};

/**
 * Readiness Pulse — free-tier Experience 3 (migration 141), the final
 * conversation of the free arc, on the Unified Adaptive Assessment
 * Runtime. Second assessment (after Life Signal Check) to populate
 * prerequisites.prerequisiteKeys for real, server-enforced gating.
 */
const READINESS_PULSE: AssessmentDefinition = {
  databaseId: '76e12c62-fb0d-478b-8543-c0693690e912',
  key: 'readiness-pulse',
  type: 'intake_questionnaire',

  displayName: 'Readiness Pulse',
  shortDescription:
    'Nine questions that find out, honestly and with zero judgment, whether you are actually ready to act on what the first two conversations found.',
  category: 'behavior_change',
  estimatedMinutes: 4,

  membership: {
    minLevel: 'free_trial',
    allowedLevels: ['free_trial', 'membership', 'holistic_reset'],
  },
  requiresAssignment: false,
  program: { programOnly: false, programKey: null, programPhase: null, phaseOrder: null },
  prerequisites: { prerequisiteKeys: ['life-signal-check'], unlockRule: null, recommendationRule: null },
  relatedAssessmentKeys: ['core-values-snapshot', 'life-signal-check'],
  clinicalPriority: 'low',
  coach: { approvalRequired: false, assignmentSupported: true, coachReviewRequired: false },
  retake: { retakeAllowed: true, retakeWaitingPeriodDays: 0 },
  reassessment: {
    supportsReassessment: true,
    stages: [],
    schedule: 'Member-initiated retake, no fixed cadence — same as every other live assessment today.',
  },
  comparison: {
    supportsSimpleHistory: true,
    supportsScoreTrend: false,
    supportsSideBySideComparison: false,
    supportsQuestionLevelComparison: false,
  },
  resultAccess: {
    memberCanView: true,
    requiresCoachPublishToView: false,
    coachCanView: true,
    adminCanView: true,
  },

  currentVersion: 1,
  versionLockingRequired: false,

  isActive: true,
  implementationStatus: 'live',
  isComingSoon: false,

  route: '/assessments/readiness-pulse',
  takeRoute: '/assessments/readiness-pulse/take',
  resultRoute: '/assessments/readiness-pulse/results/[sessionId]',
  componentRef: 'components/readiness-pulse/ReadinessPulseTaker.tsx',
  introCopyRef: 'lib/readiness-pulse/copy.ts',

  scoringAdapter: 'unified-runtime-findings',
  resultAdapter: 'readiness-pulse-results',
  storageAdapter: 'unified-assessment-runtime-tables',

  displayOrder: 0.6,
  safetyCategory: 'none',
};

const ASSESSMENT_REGISTRY: Record<AssessmentKey, AssessmentDefinition> = {
  'onboarding-health-history': ONBOARDING,
  'chek-hlc1-nutrition-lifestyle': CHEK_HLC1,
  'four-doctors': FOUR_DOCTORS,
  'primal-pattern-diet-type': PRIMAL_PATTERN,
  'body-assessment': BODY_ASSESSMENT,
  'readiness-to-change': READINESS_TO_CHANGE,
  'short-haq': SHORT_HAQ,
  'finding-1-love': FINDING_1_LOVE,
  wbsa: WBSA,
  'core-values-snapshot': CORE_VALUES_SNAPSHOT,
  'life-signal-check': LIFE_SIGNAL_CHECK,
  'readiness-pulse': READINESS_PULSE,
};

export function getAssessmentRegistryEntry(key: AssessmentKey): AssessmentDefinition {
  return ASSESSMENT_REGISTRY[key];
}

export function findAssessmentRegistryEntry(key: string): AssessmentDefinition | null {
  return (ASSESSMENT_REGISTRY as Record<string, AssessmentDefinition>)[key] ?? null;
}

export function listAssessmentRegistryEntries(): AssessmentDefinition[] {
  return Object.values(ASSESSMENT_REGISTRY).sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * Assignable from the coach dashboard (section 10): every registered,
 * implemented (`implementationStatus === 'live'`) assessment. Coach-Assign-
 * Only Gating task (2026-08-04): Body Assessment used to be excluded here
 * because it had no gating of its own yet — now that it's
 * `requiresAssignment: true` like every other proprietary tool, a coach
 * needs this list to include it too, or there would be no way to ever
 * unlock it for a member. Coming Soon placeholders (Readiness to Change,
 * Finding 1 Love) stay excluded — `implementationStatus !== 'live'` for
 * both, since neither has real question content yet.
 */
export function listAssignableAssessments(): AssessmentDefinition[] {
  return listAssessmentRegistryEntries().filter((e) => e.implementationStatus === 'live');
}

/**
 * Questionnaire content mapping — Reusable Assessment Engine.
 *
 * Absorbed unchanged from the former lib/assessments/registry.ts. This is
 * the *only* place that needs a new line when a future generic-engine
 * questionnaire ships: add a lib/assessments/<questionnaire-id>/ folder
 * with its own questionnaire.json (source-of-truth data, verified against
 * its own spec exactly like an existing assessment was) and copy.ts
 * (results-page presentation content), then register it below. No route,
 * component, server action, or database migration needs to change —
 * every UI surface under app/assessments/[questionnaireId]/ and every
 * function in lib/assessments/store.ts resolves the questionnaire
 * generically through this map.
 *
 * Deliberately a separate map from ASSESSMENT_REGISTRY above, not merged
 * into it: ASSESSMENT_REGISTRY is keyed by AssessmentKey and covers all 9
 * assessment systems (Onboarding, Primal Pattern, Body Assessment, WBSA,
 * Coming Soon placeholders, etc.); this map is keyed by questionnaire.id
 * and only ever covers the 3 questionnaires that actually run on the
 * generic engine (lib/assessments/engine/*) — CHEK HLC1, Four Doctors,
 * and Short-HAQ. The two `AssessmentDefinition` types (this file's own,
 * imported from ./types, vs. the generic engine's, imported here as
 * `AssessmentContentDefinition` from ../assessments/engine/types) name
 * completely different shapes and are not interchangeable.
 */
const QUESTIONNAIRE_CONTENT_REGISTRY: Record<string, AssessmentContentDefinition> = {
  [CHEK_HLC1_QUESTIONNAIRE.id]: {
    questionnaire: CHEK_HLC1_QUESTIONNAIRE,
    copy: CHEK_HLC1_COPY,
  },
  [FOUR_DOCTORS_QUESTIONNAIRE.id]: {
    questionnaire: FOUR_DOCTORS_QUESTIONNAIRE,
    copy: FOUR_DOCTORS_COPY,
  },
  [SHORT_HAQ_QUESTIONNAIRE.id]: {
    questionnaire: SHORT_HAQ_QUESTIONNAIRE,
    copy: SHORT_HAQ_COPY,
  },
};

export function getAssessmentDefinition(questionnaireId: string): AssessmentContentDefinition {
  const definition = QUESTIONNAIRE_CONTENT_REGISTRY[questionnaireId];
  if (!definition) {
    throw new Error(`Unknown questionnaire id: "${questionnaireId}"`);
  }
  return definition;
}

export function findAssessmentDefinition(
  questionnaireId: string
): AssessmentContentDefinition | null {
  return QUESTIONNAIRE_CONTENT_REGISTRY[questionnaireId] ?? null;
}

export function listAssessmentDefinitions(): AssessmentContentDefinition[] {
  return Object.values(QUESTIONNAIRE_CONTENT_REGISTRY);
}
