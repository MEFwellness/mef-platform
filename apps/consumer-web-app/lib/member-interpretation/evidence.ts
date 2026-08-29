/**
 * Member Interpretation Layer — assembling the evidence behind a finding.
 *
 * Two sources, and they are different in kind:
 *
 *   1. The registry row's own `evidence_refs`. These say which submission,
 *      assessment or record produced the finding in the first place. They
 *      are provenance.
 *   2. The member's own check-in days that actually touch this signal. A
 *      finding that says "elevated stress" and a member who logged high
 *      stress on nine separate days are the same fact, and the tier is
 *      meant to reflect exactly that. Without this, a finding written once
 *      at intake would sit at "early indication" forever no matter how many
 *      times she confirmed it herself, which would make the tiers decorative.
 *
 * The second source is what makes a tier rise, and it can only be produced
 * by the member logging a check-in. That is the rule, expressed as the
 * mechanism.
 *
 * Pure. Takes already-fetched rows.
 */

import type { RegistryEntry } from '@mef/shared-types-contracts';
import {
  digestionStatus,
  energyStatus,
  moodStatus,
  movementStatus,
  painStatus,
  sleepQualityStatus,
  stressStatus,
  type MetricStatus,
} from '../wellness/status';
import type { EvidenceItem, EvidenceKind } from './types';

/**
 * The subset of a check-in this layer reads. Same column set
 * lib/root-map/coverage.ts already selects, so the days counted for a tier
 * and the days counted for a coverage label can never diverge.
 */
export type InterpretationCheckin = {
  id: string;
  local_date: string;
  sleep_quality: number | null;
  movement_today: string | null;
  energy_level: number | null;
  pain_discomfort_level: number | null;
  digestion_rating: number | null;
  stress_level: number | null;
  mood_level: number | null;
};

export const INTERPRETATION_CHECKIN_COLUMNS =
  'id, local_date, sleep_quality, movement_today, energy_level, pain_discomfort_level, digestion_rating, stress_level, mood_level';

/**
 * `evidence_refs[].type` -> what kind of evidence that is.
 *
 * Anything not on this list is 'background_computation', which is the safe
 * default in the only direction that matters: an unrecognised source can
 * never raise a tier. A new producer that genuinely represents member
 * evidence has to be added here deliberately, which is the point.
 */
const KIND_BY_REF_TYPE: Record<string, EvidenceKind> = {
  onboarding_submission: 'intake_answer',
  onboarding_answer: 'intake_answer',
  questionnaire_submission: 'assessment_result',
  assessment_submission: 'assessment_result',
  unified_assessment_session: 'assessment_result',
  stress_load_session: 'assessment_result',
  body_assessment: 'assessment_result',
  primal_pattern_result: 'assessment_result',
  wbsa_submission: 'assessment_result',
  daily_checkin: 'checkin_day',
  daily_checkin_range: 'checkin_day',
  movement_session: 'logged_data',
  member_food_log: 'logged_data',
  food_analysis_result: 'logged_data',
  wearable_daily_metric: 'logged_data',
  coach_note: 'coach_input',
  coach_intelligence: 'coach_input',
};

/** Plain-language name for one provenance ref. Never an internal type slug shown raw. */
const LABEL_BY_KIND: Record<EvidenceKind, string> = {
  intake_answer: 'an answer you gave at intake',
  assessment_result: 'a result from an assessment you completed',
  checkin_day: 'a day you checked in',
  logged_data: 'something you logged',
  coach_input: 'input from your coach',
  background_computation: 'a calculation Root ran in the background',
};

export function evidenceFromRegistryEntry(entry: RegistryEntry): EvidenceItem[] {
  return entry.evidence_refs.map((ref) => {
    const kind = KIND_BY_REF_TYPE[ref.type] ?? 'background_computation';
    return {
      kind,
      ref: ref.id,
      label: LABEL_BY_KIND[kind],
      // A provenance ref carries no local date of its own. `recorded_at` is
      // when the underlying event happened, which is the honest date for it.
      localDate: entry.recorded_at.slice(0, 10),
    };
  });
}

/**
 * Which check-in field is real, per-day evidence for a given finding code,
 * and what counts as the finding being present that day.
 *
 * Every predicate reuses lib/wellness/status.ts, the app's single source of
 * truth for what a raw value means, rather than re-deciding a threshold
 * here. A day only counts when the value lands in 'attention' or 'poor':
 * a day she logged good sleep is not evidence for a poor-sleep finding.
 */
type CheckinProbe = {
  read: (checkin: InterpretationCheckin) => MetricStatus;
};

const CONCERNING: ReadonlySet<MetricStatus> = new Set<MetricStatus>(['attention', 'poor']);

const PROBE_BY_CODE: Record<string, CheckinProbe> = {
  elevated_stress: { read: (c) => stressStatus(c.stress_level) },
  // The Stress & Load Deep-Dive's two dimensions, and they probe two
  // DIFFERENT check-in columns on purpose. The load finding rises on days
  // she logged real stress; the recovery finding rises on days her energy
  // was low. If both read the same column, one sitting's two sides would
  // tier together and the separation the whole experience exists for would
  // quietly stop being true here.
  stress_load_burden: { read: (c) => stressStatus(c.stress_level) },
  recovery_capacity: { read: (c) => energyStatus(c.energy_level) },
  stress_and_mood_pattern: { read: (c) => stressStatus(c.stress_level) },
  poor_sleep_quality: { read: (c) => sleepQualityStatus(c.sleep_quality) },
  sleep_quality_pattern: { read: (c) => sleepQualityStatus(c.sleep_quality) },
  circadian_disruption: { read: (c) => sleepQualityStatus(c.sleep_quality) },
  low_energy: { read: (c) => energyStatus(c.energy_level) },
  energy_fatigue_pattern: { read: (c) => energyStatus(c.energy_level) },
  digestive_complaints: { read: (c) => digestionStatus(c.digestion_rating) },
  digestive_wellness_concern: { read: (c) => digestionStatus(c.digestion_rating) },
  emotional_wellbeing_concern: { read: (c) => moodStatus(c.mood_level) },
  movement_deficiency: {
    read: (c) => movementStatus(c.movement_today as Parameters<typeof movementStatus>[0]),
  },
  pain_neck: { read: (c) => painStatus(c.pain_discomfort_level) },
  pain_shoulders: { read: (c) => painStatus(c.pain_discomfort_level) },
  pain_upper_back: { read: (c) => painStatus(c.pain_discomfort_level) },
  pain_lower_back: { read: (c) => painStatus(c.pain_discomfort_level) },
  pain_hips: { read: (c) => painStatus(c.pain_discomfort_level) },
  pain_knees: { read: (c) => painStatus(c.pain_discomfort_level) },
  musculoskeletal_discomfort_pattern: { read: (c) => painStatus(c.pain_discomfort_level) },
};

/**
 * The member's own logged days that support this finding.
 *
 * A code with no probe returns an empty list, which is honest: there is no
 * daily question that touches it, so no number of check-ins can establish
 * it. That is the same distinction Case View already draws when it lists
 * what is "not trackable yet".
 */
export function checkinEvidenceForCode(
  code: string,
  checkins: readonly InterpretationCheckin[]
): EvidenceItem[] {
  const probe = PROBE_BY_CODE[code];
  if (!probe) return [];

  return checkins
    .filter((checkin) => CONCERNING.has(probe.read(checkin)))
    .map((checkin) => ({
      kind: 'checkin_day' as const,
      ref: checkin.id,
      label: LABEL_BY_KIND.checkin_day,
      localDate: checkin.local_date,
    }));
}

/** True when a daily check-in question exists that can ever establish this finding. */
export function isTrackableInCheckins(code: string): boolean {
  return code in PROBE_BY_CODE;
}
