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
 */

import type { AssessmentDefinition, AssessmentKey } from './types';

const ONBOARDING: AssessmentDefinition = {
  databaseId: '6b86f205-a75b-452f-b926-4c5dffc29baa',
  key: 'onboarding-health-history',
  type: 'intake_questionnaire',

  displayName: 'Onboarding Assessment',
  shortDescription: 'Health history and lifestyle intake completed at signup, with unlimited reassessments.',
  category: 'health_history',
  estimatedMinutes: 15,

  membership: { minLevel: 'free_trial', allowedLevels: ['free_trial', 'membership', 'holistic_reset'] },
  program: { programOnly: false, programKey: null, programPhase: null, phaseOrder: null },
  prerequisites: { prerequisiteKeys: [], unlockRule: null, recommendationRule: null },
  coach: { approvalRequired: false, assignmentSupported: true, coachReviewRequired: false },
  retake: { retakeAllowed: true, retakeWaitingPeriodDays: 0 },
  reassessment: {
    supportsReassessment: true,
    stages: ['baseline', 'reassessment'],
    schedule: 'Member-initiated, no fixed cadence enforced today (checkpoint_label 30/90-day columns exist but are unread).',
  },
  comparison: {
    supportsSimpleHistory: true,
    supportsScoreTrend: false,
    supportsSideBySideComparison: true,
    supportsQuestionLevelComparison: true,
  },
  resultAccess: { memberCanView: true, requiresCoachPublishToView: false, coachCanView: true, adminCanView: true },

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
  shortDescription: 'A 91-question, 7-category nutrition and lifestyle questionnaire with category-level priority scoring.',
  category: 'nutrition_lifestyle',
  estimatedMinutes: 20,

  membership: { minLevel: 'free_trial', allowedLevels: ['free_trial', 'membership', 'holistic_reset'] },
  program: { programOnly: false, programKey: null, programPhase: null, phaseOrder: null },
  prerequisites: { prerequisiteKeys: [], unlockRule: null, recommendationRule: null },
  coach: { approvalRequired: false, assignmentSupported: true, coachReviewRequired: false },
  retake: { retakeAllowed: true, retakeWaitingPeriodDays: 0 },
  reassessment: {
    supportsReassessment: true,
    stages: [],
    schedule: 'Unlimited retakes, no cooldown or expiry, by explicit product decision — a retake is just a new attempt row.',
  },
  comparison: {
    supportsSimpleHistory: true,
    supportsScoreTrend: true,
    supportsSideBySideComparison: false,
    supportsQuestionLevelComparison: false,
  },
  resultAccess: { memberCanView: true, requiresCoachPublishToView: false, coachCanView: true, adminCanView: true },

  currentVersion: 1,
  versionLockingRequired: false,

  isActive: true,
  implementationStatus: 'live',
  isComingSoon: false,

  route: '/assessments/chek-hlc1-nutrition-lifestyle',
  takeRoute: '/assessments/chek-hlc1-nutrition-lifestyle/take',
  resultRoute: '/assessments/chek-hlc1-nutrition-lifestyle/results/[assessmentId]',
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
  shortDescription: 'A 54-question, 4-category binary questionnaire covering movement, nutrition, breathing, and rest.',
  category: 'holistic_balance',
  estimatedMinutes: 12,

  membership: { minLevel: 'free_trial', allowedLevels: ['free_trial', 'membership', 'holistic_reset'] },
  program: { programOnly: false, programKey: null, programPhase: null, phaseOrder: null },
  prerequisites: { prerequisiteKeys: [], unlockRule: null, recommendationRule: null },
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
  resultAccess: { memberCanView: true, requiresCoachPublishToView: false, coachCanView: true, adminCanView: true },

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
  shortDescription: 'A 14-question letter-select instrument classifying dietary pattern as polar, variable, or equatorial.',
  category: 'nutrition_lifestyle',
  estimatedMinutes: 8,

  membership: { minLevel: 'free_trial', allowedLevels: ['free_trial', 'membership', 'holistic_reset'] },
  program: { programOnly: false, programKey: null, programPhase: null, phaseOrder: null },
  prerequisites: { prerequisiteKeys: [], unlockRule: null, recommendationRule: null },
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
  resultAccess: { memberCanView: true, requiresCoachPublishToView: false, coachCanView: true, adminCanView: true },

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
  shortDescription: 'Guided camera-based posture and movement capture (static posture, gait, mobility, and more), reviewed by a coach.',
  category: 'movement',
  estimatedMinutes: 10,

  membership: { minLevel: 'free_trial', allowedLevels: ['free_trial', 'membership', 'holistic_reset'] },
  program: { programOnly: false, programKey: null, programPhase: null, phaseOrder: null },
  prerequisites: { prerequisiteKeys: [], unlockRule: null, recommendationRule: null },
  coach: { approvalRequired: false, assignmentSupported: true, coachReviewRequired: true },
  retake: { retakeAllowed: true, retakeWaitingPeriodDays: 0 },
  reassessment: {
    supportsReassessment: true,
    stages: [],
    schedule: 'Implicit only — "previous" is computed live as the most recent same-type assessment, no explicit baseline/reassessment marker.',
  },
  comparison: {
    supportsSimpleHistory: true,
    supportsScoreTrend: false,
    supportsSideBySideComparison: true,
    supportsQuestionLevelComparison: false,
  },
  resultAccess: { memberCanView: true, requiresCoachPublishToView: true, coachCanView: true, adminCanView: true },

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

const ASSESSMENT_REGISTRY: Record<AssessmentKey, AssessmentDefinition> = {
  'onboarding-health-history': ONBOARDING,
  'chek-hlc1-nutrition-lifestyle': CHEK_HLC1,
  'four-doctors': FOUR_DOCTORS,
  'primal-pattern-diet-type': PRIMAL_PATTERN,
  'body-assessment': BODY_ASSESSMENT,
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
