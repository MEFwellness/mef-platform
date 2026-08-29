/**
 * The one place a finding's name is decided.
 *
 * A finding's name is stored on the row that produced it
 * (`registry_entries.label`), and those rows go back months. Renaming a
 * finding by editing the adapter that writes it would rename it only for
 * members who trigger it again, so two members would read two different
 * names for the same answer and a coach would read a third.
 *
 * So the stored label is treated as history, and the NAME is looked up here
 * by the finding's stable identity, `domain::code`. Every screen renders the
 * finding through the Member Interpretation Layer, the layer authors its
 * sentence from this map, and a rename is therefore one edit that lands
 * everywhere on the next page load, with no migration required to be
 * correct. The migration that supersedes the stored text exists so the
 * historical row agrees with what she is now being shown, not so the screens
 * work.
 *
 * Every name here follows docs/NAMING-STANDARD.md: what she experiences, or
 * what the check looks at. Never a condition, a pathogen, an organ, or a
 * deficiency. `tests/naming-standard.test.ts` asserts that over this whole
 * map rather than trusting the author.
 */

import type { PostureFindingType } from '@mef/shared-types-contracts';
import { humanizeRawValue } from './displayNames';

/**
 * `domain::code` to the name a member and her coach both read.
 *
 * The old wording is on each line, because a rename table nobody can read
 * six months later is a rename nobody can audit.
 */
export const FINDING_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  // --- Intake and reassessment sliders (lib/registry/adapters/onboarding.ts)
  'sleep::poor_sleep_quality': 'Sleep that has not been leaving you rested', // was "Poor Sleep Quality"
  'stress::elevated_stress': 'The stress you are carrying', // was "Elevated Stress"
  'sleep::low_energy': 'Energy that runs out through the day', // was "Low Energy"
  'nutrition::digestive_complaints': 'Digestion that has been uncomfortable', // was "Digestive Complaints"

  // --- Where it hurts (lib/registry/adapters/onboarding.ts, PAIN_AREAS)
  'movement::pain_neck': 'Neck discomfort you reported', // was "Discomfort: neck"
  'movement::pain_shoulders': 'Shoulder discomfort you reported', // was "Discomfort: shoulders"
  'movement::pain_upper_back': 'Upper back discomfort you reported', // was "Discomfort: upper back"
  'movement::pain_lower_back': 'Lower back discomfort you reported', // was "Discomfort: lower back"
  'movement::pain_hips': 'Hip discomfort you reported', // was "Discomfort: hips"
  'movement::pain_knees': 'Knee discomfort you reported', // was "Discomfort: knees"

  // --- Nutrition & Lifestyle Questionnaire (lib/registry/adapters/questionnaireEngine.ts)
  'nutrition::nutrition_quality_concern': 'The quality of what you are eating', // was "Nutrition Quality Concerns"
  'sleep::circadian_disruption': 'Your daily sleep and wake rhythm', // was "Circadian Rhythm Disruption"
  'nutrition::meal_timing_irregularity': 'When you eat across the day', // was "Irregular Meal Timing"
  'nutrition::gut_fungal_parasite_concern': 'Bloating, cravings and gut discomfort', // was "Gut Fungal & Parasite Concerns"
  'nutrition::detoxification_load_concern':
    'Headaches, skin changes and sensitivity to strong smells', // was "Detoxification Load Concerns"

  // --- Four Doctors Assessment
  'stress::emotional_wellbeing_concern': 'How you have been feeling day to day', // was "Emotional Wellbeing Concern"
  'nutrition::diet_quality_concern': 'What your everyday eating looks like', // was "Diet Quality Concern"
  'movement::movement_deficiency': 'How much you have been moving', // was "Movement Deficiency"

  // --- Short Health Assessment Questionnaire
  'nutrition::digestive_wellness_concern': 'How your digestion has been settling', // was "Digestive Wellness Concerns"
  'movement::energy_fatigue_pattern': 'Energy and tiredness through the week', // was "Energy & Fatigue Pattern"
  'sleep::sleep_quality_pattern': 'How your nights have been going', // was "Sleep Quality Pattern"
  'stress::stress_and_mood_pattern': 'Stress and mood together', // was "Stress & Mood Pattern"
  'breathing::immune_respiratory_pattern': 'Colds, congestion and how easily you breathe', // was "Immune & Respiratory Pattern"
  'movement::musculoskeletal_discomfort_pattern': 'Aches and stiffness when you move', // was "Musculoskeletal Discomfort Pattern"
  'movement::cardiovascular_circulation_pattern': 'How you feel with effort, and cold hands or feet', // was "Cardiovascular & Circulation Pattern"
  'stress::cognitive_clarity_pattern': 'Focus and mental clarity', // was "Cognitive Clarity Pattern"
  'hormone::hormonal_balance_pattern': 'Cycle, mood and energy changes over the month', // was "Hormonal Balance Pattern"

  // --- Primal Pattern Diet Type (a preference result, never a problem)
  'nutrition::primal_pattern_type': 'Your eating type from the Primal Pattern quiz',

  // --- Stress & Load Deep-Dive (lib/stress-load/rootMap.ts). Two names,
  //     because it is two findings under two Coaching Domains, never one.
  'stress::stress_load_burden': 'What your life has been asking of you',
  'stress::recovery_capacity': 'What has been giving back to you',

  // --- Movement sessions
  'movement::movement_session_completed': 'A movement session you completed',
};

/**
 * Posture findings, renamed for the member.
 *
 * These reach a member screen (`lib/registry/adapters/bodyAssessment.ts`
 * writes them `member_visible: true`), and until now they reached it as the
 * raw enum with its underscores swapped for spaces, so a member read
 * "thoracic kyphosis" as a finding about herself. `FINDING_TYPE_CONFIG` was
 * always the right source for the coach's wording; this is the member's.
 */
export const POSTURE_MEMBER_NAMES: Readonly<Record<PostureFindingType, string>> = {
  forward_head: 'Head sitting forward of your shoulders',
  rounded_shoulders: 'Shoulders rolling forward',
  elevated_shoulder: 'One shoulder sitting higher than the other',
  pelvic_tilt: 'The tilt of your pelvis',
  thoracic_kyphosis: 'Rounding through your upper back',
  lumbar_posture: 'The curve of your lower back',
  knee_valgus: 'Knees drifting inward',
  foot_turnout: 'Feet turning outward',
  weight_shift: 'Weight favouring one side',
  breathing_pattern: 'How you are breathing',
  hip_asymmetry: 'Hips sitting unevenly',
  lateral_trunk_asymmetry: 'Side to side evenness through your trunk',
  lower_crossed_pattern: 'A tight hips and long back combination worth looking at',
  sagittal_trunk_posture: 'How you stack from the side',
  pelvic_drop_screening: 'How level your hips stay on one leg',
  custom: 'An observation your coach added',
};

/**
 * The name to show for one finding.
 *
 * `storedLabel` is the last resort and is deliberately not trusted: a label
 * written by an adapter years ago may be a raw enum or a retired clinical
 * name, so it is humanized on the way out rather than printed as found.
 */
export function findingDisplayName(
  domain: string,
  code: string,
  storedLabel?: string | null
): string {
  const mapped = FINDING_DISPLAY_NAMES[`${domain}::${code}`];
  if (mapped) return mapped;

  const posture = POSTURE_MEMBER_NAMES[code as PostureFindingType];
  if (posture) return posture;

  if (storedLabel && storedLabel.trim().length > 0) {
    // A stored label that still reads like an identifier (no spaces, or
    // underscores) is an enum that escaped an adapter, not a name.
    if (/_/.test(storedLabel) || !/\s/.test(storedLabel)) return humanizeRawValue(storedLabel);
    return storedLabel;
  }

  return humanizeRawValue(code);
}

/**
 * Every stable finding key this app knows a name for. Used by the migration
 * generator and by the test that asserts the map is standard compliant.
 */
export function allNamedFindingKeys(): string[] {
  return Object.keys(FINDING_DISPLAY_NAMES);
}
