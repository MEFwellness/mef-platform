/**
 * Every raw stored value's plain-language name, in one file.
 *
 * The audit found roughly sixteen places on coach screens printing a stored
 * enum straight into the page: `restricted_topic`, `self_harm_crisis`,
 * `daily_checkin`, `coach_follow_up`, `repeated signal`. Each of those was a
 * separate small omission, and each would have happened again the next time
 * somebody added a value, because there was nowhere for the name to live.
 *
 * There is now. `displayName(vocabulary, value)` is the only sanctioned way
 * to print a stored value, and an unmapped value FAILS LOUDLY IN
 * DEVELOPMENT: it throws, so the person adding the value meets the problem
 * on their own machine. In production it degrades to a humanized string
 * rather than throwing, because a coach reading "Self harm crisis" instead
 * of a crashed page is the better failure, and it logs so the gap is still
 * visible.
 *
 * Adding a value to any union below without adding it here is a type error
 * for the unions this file types exhaustively, and a runtime failure in
 * development for the ones it does not.
 */

import type {
  FindingSeverity,
  FindingStatus,
  IntelligenceAlertStatus,
  IntelligenceAlertType,
  RegistryDomain,
  RegistryEntrySeverity,
  SafetyClassificationLevel,
  SafetyReviewStatus,
  SafetySourceFeature,
  SafetyUrgency,
  WellnessInsightSeverity,
  WellnessInsightStatus,
} from '@mef/shared-types-contracts';

/**
 * One vocabulary per stored column. Named after what the column holds, not
 * after the screen that shows it, so two screens showing the same column
 * cannot drift apart.
 */
export type Vocabulary =
  | 'safety_classification_level'
  | 'safety_urgency'
  | 'safety_source_feature'
  | 'safety_review_status'
  | 'wellness_insight_severity'
  | 'wellness_insight_status'
  | 'coach_alert_type'
  | 'coach_alert_status'
  | 'registry_domain'
  | 'registry_severity'
  | 'posture_finding_severity'
  | 'posture_finding_status'
  | 'recommendation_domain'
  | 'coaching_topic_source_state'
  | 'movement_profile_review_status'
  | 'reassessment_trigger_source'
  | 'member_submission_kind'
  | 'prescription_confidence_level';

type Table<K extends string> = Readonly<Record<K, string>>;

const SAFETY_CLASSIFICATION_LEVEL: Table<SafetyClassificationLevel> = {
  standard_coaching: 'Normal coaching',
  coaching_with_caution: 'Coach with care',
  medical_evaluation_recommended: 'Suggest she sees a healthcare professional',
  coach_review_required: 'Needs a coach to review it',
  safety_response_only: 'Safety response only, no coaching on this topic',
};

const SAFETY_URGENCY: Table<SafetyUrgency> = {
  critical: 'Reach her today',
  high: 'Reach her within a day',
  medium: 'Follow up this week',
  low: 'Worth a mention',
  none: 'Nothing to act on',
};

const SAFETY_SOURCE_FEATURE: Table<SafetySourceFeature> = {
  daily_checkin: 'Her daily check-in',
  coach_note: 'A coach note',
  ai_recommendation: 'A suggestion Root generated',
  daily_feed: "Her day's lesson",
  dynamic_coaching: 'Daily coaching',
  wellness_intelligence: 'Pattern detection',
  conversation_coach: 'Her conversation with Root',
  body_assessment: 'The Body Assessment',
  member_wellness_event: 'Something she logged',
  unified_assessment: 'An assessment she completed',
};

const SAFETY_REVIEW_STATUS: Table<SafetyReviewStatus> = {
  new: 'New',
  reviewing: 'Being reviewed',
  approved_for_limited_coaching: 'Cleared for limited coaching',
  referred_out: 'Referred to a professional',
  urgent_follow_up: 'Urgent follow-up',
  closed: 'Closed',
};

const WELLNESS_INSIGHT_SEVERITY: Table<WellnessInsightSeverity> = {
  important: 'Worth acting on',
  notable: 'Worth noticing',
  info: 'Background',
};

const WELLNESS_INSIGHT_STATUS: Table<WellnessInsightStatus> = {
  active: 'Open',
  confirmed: 'Confirmed with her',
  dismissed: 'Dismissed',
  resolved: 'Resolved',
  superseded: 'Replaced by a newer one',
  stale: 'Out of date',
};

const COACH_ALERT_TYPE: Table<IntelligenceAlertType> = {
  needs_review: 'Waiting on a coach to look at it',
  burnout_risk: 'Carrying a lot right now',
  assessment_overdue: 'Time for a reassessment',
  no_checkin: 'No recent check-in',
  symptoms_worsening: 'Something she reports is getting worse',
  rapid_improvement: 'Something is clearly improving',
  plateau: 'Progress has levelled off',
  recurring_barriers: 'The same thing keeps getting in the way',
  repeated_safety_flags: 'Safety cases open',
  medical_evaluation_recommended: 'Suggest she sees a healthcare professional',
  assessment_finding_requires_attention: 'An assessment answer needs attention',
};

const COACH_ALERT_STATUS: Table<IntelligenceAlertStatus> = {
  open: 'Open',
  acknowledged: 'Seen',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

/**
 * The registry's own stored domains. These are engineering vocabulary and
 * were never meant to be read by anyone; a coach seeing "renal" on a screen
 * is the exact leak this file exists to close.
 */
const REGISTRY_DOMAIN: Table<RegistryDomain> = {
  posture: 'Posture',
  movement: 'Movement',
  breathing: 'Breathing',
  questionnaire: 'Questionnaire answers',
  sleep: 'Sleep',
  stress: 'Stress',
  nutrition: 'Food and eating',
  wearable: 'Device data',
  lab: 'Lab results',
  hormone: 'Cycle and hormones',
  digestive: 'Digestion',
  metabolic: 'Energy and blood sugar',
  immune: 'Colds and congestion',
  circulatory: 'Circulation',
  renal: 'Fluid balance',
  neurological: 'Focus and clarity',
  dermatological: 'Skin, hair and nails',
};

const REGISTRY_SEVERITY: Table<RegistryEntrySeverity> = {
  none: 'Not a concern now',
  mild: 'Mild',
  moderate: 'Moderate',
  significant: 'Significant',
  unknown: 'Not rated',
};

const POSTURE_FINDING_SEVERITY: Table<FindingSeverity> = {
  none: 'Not seen',
  mild: 'Mild',
  moderate: 'Moderate',
  significant: 'Significant',
  unknown: 'Not rated',
};

const POSTURE_FINDING_STATUS: Table<FindingStatus> = {
  draft: 'Draft',
  pending_review: 'Waiting on your review',
  confirmed: 'Confirmed',
  coach_overridden: 'Changed by a coach',
  dismissed: 'Dismissed',
  superseded: 'Replaced by a newer one',
};

/**
 * The Recommendation Engine's own `domain` field. It is not a wellness
 * domain at all, it is which engine produced the row, which is why printing
 * it read as "daily coaching" and "coach follow up" next to real domain
 * names.
 */
const RECOMMENDATION_DOMAIN: Readonly<Record<string, string>> = {
  daily_coaching: "Today's coaching",
  coach_follow_up: 'For the coach to follow up',
  weekly_practice: 'A weekly practice',
  daily_habit: 'A daily habit',
  assessment: 'An assessment to consider',
  experiment: 'An experiment to try',
  movement: 'Movement',
  nutrition: 'Food and eating',
  sleep: 'Sleep',
  stress: 'Stress',
  recovery: 'Recovery',
  hydration: 'Water',
};

/** Why the coaching engine raised a topic. Was rendered with its underscores swapped for spaces. */
const COACHING_TOPIC_SOURCE_STATE: Readonly<Record<string, string>> = {
  emerging: 'Just starting to show up',
  established: 'Has shown up consistently',
  improving: 'Moving in a better direction',
  worsening: 'Moving the wrong way',
  stale: 'Has not come up lately',
  conflicting: 'Her answers disagree with each other',
  conflicting_information: 'Her answers disagree with each other',
  repeated_signal: 'The same thing more than once',
  one_time_observation: 'Mentioned once',
  recurring_pattern: 'Keeps recurring',
  experiment_unsuccessful: 'An experiment that did not land',
  experiment_successful: 'An experiment that worked',
};

const MOVEMENT_PROFILE_REVIEW_STATUS: Readonly<Record<string, string>> = {
  pending: 'Waiting on your review',
  approved: 'Approved',
  rejected: 'Not approved',
  superseded: 'Replaced by a newer one',
  auto_approved: 'Approved automatically',
};

const REASSESSMENT_TRIGGER_SOURCE: Readonly<Record<string, string>> = {
  coach_request: 'Your coach asked for it',
  schedule: 'On schedule',
  scheduled: 'On schedule',
  finding: 'Something a finding raised',
  finding_driven: 'Something a finding raised',
  member_initiated: 'She asked for it',
  router: 'Suggested by the coaching router',
  cadence: 'Due on its usual cadence',
};

/** What a member actually filled in. Was rendered as the raw table name. */
const MEMBER_SUBMISSION_KIND: Readonly<Record<string, string>> = {
  onboarding: 'Her intake answers',
  reassessment: 'A reassessment',
  wellness_assessment: 'A questionnaire',
  unified_assessment: 'An assessment',
  body_assessment: 'The Body Assessment',
  core_values_snapshot: 'The Core Values Snapshot',
  life_signal_check: 'The Life Signal Check',
  readiness_pulse: 'The Readiness Pulse',
  wbsa: 'The Whole-Body Check-In',
  primal_pattern: 'The Primal Pattern quiz',
  four_doctors: 'The Four Doctors Assessment',
};

const PRESCRIPTION_CONFIDENCE_LEVEL: Readonly<Record<string, string>> = {
  high: 'Plenty to go on',
  moderate: 'Something to go on',
  medium: 'Something to go on',
  low: 'Not much to go on',
  insufficient_data: 'Not enough to go on yet',
};

const TABLES: Readonly<Record<Vocabulary, Readonly<Record<string, string>>>> = {
  safety_classification_level: SAFETY_CLASSIFICATION_LEVEL,
  safety_urgency: SAFETY_URGENCY,
  safety_source_feature: SAFETY_SOURCE_FEATURE,
  safety_review_status: SAFETY_REVIEW_STATUS,
  wellness_insight_severity: WELLNESS_INSIGHT_SEVERITY,
  wellness_insight_status: WELLNESS_INSIGHT_STATUS,
  coach_alert_type: COACH_ALERT_TYPE,
  coach_alert_status: COACH_ALERT_STATUS,
  registry_domain: REGISTRY_DOMAIN,
  registry_severity: REGISTRY_SEVERITY,
  posture_finding_severity: POSTURE_FINDING_SEVERITY,
  posture_finding_status: POSTURE_FINDING_STATUS,
  recommendation_domain: RECOMMENDATION_DOMAIN,
  coaching_topic_source_state: COACHING_TOPIC_SOURCE_STATE,
  movement_profile_review_status: MOVEMENT_PROFILE_REVIEW_STATUS,
  reassessment_trigger_source: REASSESSMENT_TRIGGER_SOURCE,
  member_submission_kind: MEMBER_SUBMISSION_KIND,
  prescription_confidence_level: PRESCRIPTION_CONFIDENCE_LEVEL,
};

/**
 * True in `next dev`, in vitest, and in any script run without
 * NODE_ENV=production. Deliberately its own function so a test can assert
 * both halves of the behaviour on the same machine.
 */
export function isDevelopmentLike(): boolean {
  return process.env.NODE_ENV !== 'production';
}

export class UnmappedDisplayValueError extends Error {
  constructor(
    public readonly vocabulary: Vocabulary,
    public readonly value: string
  ) {
    super(
      `No display name for "${value}" in vocabulary "${vocabulary}". ` +
        `Add it to lib/naming/displayNames.ts. Raw stored values must never reach a screen ` +
        `(see docs/NAMING-STANDARD.md).`
    );
    this.name = 'UnmappedDisplayValueError';
  }
}

/**
 * The plain-language name for one stored value.
 *
 * Throws in development on an unmapped value, which is the whole point: a
 * new enum value must break for the person adding it, not leak to a coach
 * months later.
 */
export function displayName(
  vocabulary: Vocabulary,
  value: string | null | undefined,
  options: { fallback?: string } = {}
): string {
  if (value === null || value === undefined || value === '') {
    return options.fallback ?? 'Not recorded';
  }

  const mapped = TABLES[vocabulary][value];
  if (mapped) return mapped;

  if (isDevelopmentLike()) throw new UnmappedDisplayValueError(vocabulary, value);

  console.error(`[naming] unmapped ${vocabulary} value: ${value}`);
  return humanizeRawValue(value);
}

/**
 * The production fallback, and the last resort inside `findingDisplayName`.
 *
 * Not a substitute for a real name. It only makes an identifier readable so
 * a coach is not staring at `self_harm_crisis`, and it is never the answer
 * anybody should be shipping.
 */
export function humanizeRawValue(value: string): string {
  const spaced = value.replaceAll('_', ' ').replaceAll('-', ' ').trim();
  if (spaced.length === 0) return 'Not recorded';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Every value this file knows a name for, for the test that asserts coverage. */
export function mappedValues(vocabulary: Vocabulary): string[] {
  return Object.keys(TABLES[vocabulary]);
}

export const ALL_VOCABULARIES = Object.keys(TABLES) as Vocabulary[];
