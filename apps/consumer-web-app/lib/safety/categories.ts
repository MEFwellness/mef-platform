/**
 * Configurable concern categories the deterministic classifier
 * (classifier.ts) scans for. Each category is a self-contained policy
 * decision: which classification level it maps to, whether it needs a
 * coach review, whether it needs member acknowledgment, and — critically
 * — which topic it restricts. Restrictions are always topic-specific
 * (restrictedTopics), never "shut down the whole account," per the
 * milestone's explicit product rule.
 *
 * Keyword lists are intentionally simple substring matches, not an NLP
 * model — this classifier must run before any LLM and be fully
 * deterministic/auditable. It is a real safety net, not a demo: expanding
 * a keyword list or adding a category never requires touching the
 * classifier logic itself, only this file.
 */

import type {
  SafetyClassificationLevel,
  SafetyUrgency,
  SafetyEscalationAction,
} from '@mef/shared-types-contracts';

export type ConcernCategoryKey =
  | 'self_harm_crisis'
  | 'fainting_loss_of_consciousness'
  | 'chest_pain_breathing'
  | 'neurological_warning_signs'
  | 'urgent_physical_symptoms'
  | 'pregnancy_warning_signs'
  | 'severe_worsening_pain'
  | 'eating_disorder_risk'
  | 'medication_questions'
  | 'diagnosis_requests'
  | 'out_of_scope_medical'
  | 'borderline_wellness_concern'
  | 'routine_wellness';

export type ConcernCategoryConfig = {
  key: ConcernCategoryKey;
  label: string;
  classificationLevel: SafetyClassificationLevel;
  urgency: SafetyUrgency;
  coachReviewRequired: boolean;
  acknowledgmentRequired: boolean;
  escalationAction: SafetyEscalationAction;
  /** The specific topic this category restricts — never the whole conversation. */
  restrictedTopics: string[];
  /** Short, auditable code stored in safety_classifications.reasoning_codes. */
  reasoningCode: string;
  /** Lowercase substrings scanned for in free-text member input. Empty for structural-only categories. */
  keywords: string[];
};

/**
 * Ordered most-to-least severe. When multiple categories match the same
 * input, this order decides which one drives the overall
 * classification_level/urgency/escalation — but restrictedTopics/
 * concern_categories still accumulate from every match, so an unrelated,
 * lower-severity topic in the same input is never silently dropped from
 * the record even though it doesn't drive the headline decision.
 */
export const CONCERN_CATEGORIES: ConcernCategoryConfig[] = [
  {
    key: 'self_harm_crisis',
    label: 'Self-harm or crisis language',
    classificationLevel: 'safety_response_only',
    urgency: 'critical',
    coachReviewRequired: true,
    acknowledgmentRequired: true,
    escalationAction: 'urgent_follow_up',
    restrictedTopics: ['self_harm'],
    reasoningCode: 'SELF_HARM_LANGUAGE_DETECTED',
    keywords: [
      'suicide',
      'suicidal',
      'kill myself',
      'end my life',
      'want to die',
      "don't want to be here",
      'do not want to be here',
      'self harm',
      'self-harm',
      'hurting myself',
      'cutting myself',
      'no reason to live',
      'better off dead',
    ],
  },
  {
    key: 'fainting_loss_of_consciousness',
    label: 'Fainting or loss of consciousness',
    classificationLevel: 'safety_response_only',
    urgency: 'critical',
    coachReviewRequired: true,
    acknowledgmentRequired: true,
    escalationAction: 'urgent_follow_up',
    restrictedTopics: ['fainting'],
    reasoningCode: 'FAINTING_OR_LOC_DETECTED',
    keywords: [
      'fainted',
      'fainting',
      'passed out',
      'passing out',
      'lost consciousness',
      'blacked out',
      'losing consciousness',
    ],
  },
  {
    key: 'chest_pain_breathing',
    label: 'Chest pain or breathing concerns',
    classificationLevel: 'safety_response_only',
    urgency: 'critical',
    coachReviewRequired: true,
    acknowledgmentRequired: true,
    escalationAction: 'urgent_follow_up',
    restrictedTopics: ['chest_pain_breathing'],
    reasoningCode: 'CHEST_PAIN_OR_BREATHING_DETECTED',
    keywords: [
      'chest pain',
      'chest tightness',
      "can't breathe",
      'cant breathe',
      'difficulty breathing',
      'shortness of breath',
      'trouble breathing',
      'heart attack',
    ],
  },
  {
    key: 'neurological_warning_signs',
    label: 'Neurological warning signs',
    classificationLevel: 'safety_response_only',
    urgency: 'critical',
    coachReviewRequired: true,
    acknowledgmentRequired: true,
    escalationAction: 'urgent_follow_up',
    restrictedTopics: ['neurological_symptoms'],
    reasoningCode: 'NEUROLOGICAL_WARNING_SIGN_DETECTED',
    keywords: [
      'slurred speech',
      'sudden numbness',
      'sudden weakness',
      'face drooping',
      'stroke',
      'seizure',
      'worst headache of my life',
      'vision loss',
      'sudden confusion',
    ],
  },
  {
    key: 'urgent_physical_symptoms',
    label: 'Urgent physical symptoms',
    classificationLevel: 'safety_response_only',
    urgency: 'high',
    coachReviewRequired: true,
    acknowledgmentRequired: true,
    escalationAction: 'coach_review_queue',
    restrictedTopics: ['urgent_symptom'],
    reasoningCode: 'URGENT_PHYSICAL_SYMPTOM_DETECTED',
    keywords: [
      'severe bleeding',
      "can't stop bleeding",
      'cant stop bleeding',
      'high fever',
      "won't stop vomiting",
      'wont stop vomiting',
      'coughing blood',
      'severe allergic reaction',
      'anaphylaxis',
    ],
  },
  {
    key: 'pregnancy_warning_signs',
    label: 'Pregnancy-related warning signs',
    classificationLevel: 'safety_response_only',
    urgency: 'high',
    coachReviewRequired: true,
    acknowledgmentRequired: true,
    escalationAction: 'urgent_follow_up',
    restrictedTopics: ['pregnancy_symptom'],
    reasoningCode: 'PREGNANCY_WARNING_SIGN_DETECTED',
    keywords: [
      'pregnant and bleeding',
      'pregnancy bleeding',
      'severe pregnancy pain',
      'baby not moving',
      'preeclampsia',
      'pregnant and severe pain',
    ],
  },
  {
    key: 'severe_worsening_pain',
    label: 'Severe or rapidly worsening pain',
    classificationLevel: 'coach_review_required',
    urgency: 'high',
    coachReviewRequired: true,
    acknowledgmentRequired: true,
    escalationAction: 'coach_review_queue',
    restrictedTopics: ['pain_severity'],
    reasoningCode: 'SEVERE_OR_WORSENING_PAIN_DETECTED',
    keywords: [
      'unbearable pain',
      'excruciating pain',
      'pain is getting worse',
      'worsening pain',
      'severe pain',
      '10 out of 10 pain',
    ],
  },
  {
    key: 'eating_disorder_risk',
    label: 'Eating-disorder risk signals',
    classificationLevel: 'coach_review_required',
    urgency: 'medium',
    coachReviewRequired: true,
    acknowledgmentRequired: true,
    escalationAction: 'coach_review_queue',
    restrictedTopics: ['eating_disorder'],
    reasoningCode: 'EATING_DISORDER_RISK_DETECTED',
    keywords: [
      'binge and purge',
      'purging after eating',
      'starving myself',
      'terrified of gaining weight',
      'not eating for days',
      'making myself throw up',
      'afraid to eat',
    ],
  },
  {
    key: 'medication_questions',
    label: 'Medication questions',
    classificationLevel: 'coach_review_required',
    urgency: 'medium',
    coachReviewRequired: true,
    acknowledgmentRequired: true,
    escalationAction: 'coach_review_queue',
    restrictedTopics: ['medication'],
    reasoningCode: 'MEDICATION_QUESTION_DETECTED',
    keywords: [
      'should i stop taking',
      'should i start taking',
      'change my dose',
      'change my dosage',
      'stop my medication',
      'increase my medication',
      'what medication should i take',
      'is it safe to take',
      'drug interaction',
      'supplement dosage for',
    ],
  },
  {
    key: 'diagnosis_requests',
    label: 'Diagnosis requests',
    classificationLevel: 'medical_evaluation_recommended',
    urgency: 'low',
    coachReviewRequired: false,
    acknowledgmentRequired: false,
    escalationAction: 'none',
    restrictedTopics: ['diagnosis'],
    reasoningCode: 'DIAGNOSIS_REQUEST_DETECTED',
    keywords: [
      'do i have',
      'what is wrong with me',
      'what condition do i have',
      'diagnose me',
      'is this a sign of',
      'could this be cancer',
      'am i diabetic',
    ],
  },
  {
    key: 'out_of_scope_medical',
    label: 'Out-of-scope medical requests',
    classificationLevel: 'medical_evaluation_recommended',
    urgency: 'low',
    coachReviewRequired: false,
    acknowledgmentRequired: false,
    escalationAction: 'none',
    restrictedTopics: ['out_of_scope_medical'],
    reasoningCode: 'OUT_OF_SCOPE_MEDICAL_REQUEST_DETECTED',
    keywords: [
      'prescribe me',
      'write me a prescription',
      'medical treatment plan',
      'treat my condition',
      'cure my',
    ],
  },
  {
    key: 'borderline_wellness_concern',
    label: 'Borderline or newly-reported concern',
    classificationLevel: 'coaching_with_caution',
    urgency: 'low',
    coachReviewRequired: false,
    acknowledgmentRequired: false,
    escalationAction: 'none',
    restrictedTopics: [],
    reasoningCode: 'NEW_OR_WORSENING_CONCERN_FLAGGED',
    // Structural-only: matched when the member flags "new or worsening
    // concern" on a check-in without any higher-severity keyword also
    // matching — not a keyword-driven category.
    keywords: [],
  },
  {
    key: 'routine_wellness',
    label: 'Routine wellness',
    classificationLevel: 'standard_coaching',
    urgency: 'none',
    coachReviewRequired: false,
    acknowledgmentRequired: false,
    escalationAction: 'none',
    restrictedTopics: [],
    reasoningCode: 'NO_CONCERN_DETECTED',
    keywords: [],
  },
];

export function getConcernCategory(key: ConcernCategoryKey): ConcernCategoryConfig {
  const category = CONCERN_CATEGORIES.find((c) => c.key === key);
  if (!category) throw new Error(`Unknown concern category: ${key}`);
  return category;
}
