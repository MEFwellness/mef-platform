/**
 * A posture finding, in the words a member uses about her own body.
 *
 * THE RULE THIS FILE EXISTS FOR. A finding has a type and a severity, and a
 * member may meet NEITHER. "Possible lower-crossed postural pattern
 * (moderate)" is a sentence for a coach. What a member is told is where the
 * work is: "your hips and your deep core". No pattern name, no severity
 * word, no confidence number, and no claim that anything is wrong with her.
 *
 * Every mapping here is to a PART OF THE BODY and nothing else. It says
 * where attention goes; it does not diagnose, and it does not say what the
 * work will achieve. That is deliberate: an area is a fact about which
 * exercises are in her program, and anything beyond it would be a claim
 * this product cannot make.
 *
 * AREAS ARE KEYS NOW, NOT PHRASES, and that is the change this pass made.
 * A posture sentence may only be said about an area the program GENUINELY
 * works. "Your last posture check pointed at your neck and upper back, so
 * those get attention in every session" is false on a program with no neck
 * work in it, and it was being said anyway, because the old check was "is
 * there a finding at all" rather than "does this program go there".
 * Answering the real question needs the finding's areas and the PROGRAM's
 * areas in one vocabulary, and a phrase like "your hips and your deep core"
 * is two areas glued together, which cannot be intersected with anything.
 * So the atom is the key, the phrase is derived from the key, and
 * ./programAreas.ts answers the other half of the question in the same
 * keys.
 *
 * An empty list means "nothing can truthfully be said in plain words about
 * this one", and it produces silence rather than a guess. `custom` is the
 * obvious case: a coach-typed observation could say anything at all.
 */
import type { FindingSeverity, PostureFindingType } from '@mef/shared-types-contracts';

/** One part of the body, as a key. See this file's header for why. */
export type BodyAreaKey =
  | 'neck'
  | 'upper_back'
  | 'shoulders'
  | 'lower_back'
  | 'hips'
  | 'deep_core'
  | 'knees'
  | 'feet'
  | 'trunk_sides'
  | 'breathing';

/** How each area is named to her. Never a muscle, never a joint's clinical name. */
export const BODY_AREA_PHRASE: Record<BodyAreaKey, string> = {
  neck: 'your neck',
  upper_back: 'your upper back',
  shoulders: 'your shoulders',
  lower_back: 'your lower back',
  hips: 'your hips',
  deep_core: 'your deep core',
  knees: 'your knees',
  feet: 'your feet and ankles',
  trunk_sides: 'the sides of your trunk',
  breathing: 'your breathing',
};

export const ALL_BODY_AREA_KEYS = Object.keys(BODY_AREA_PHRASE) as BodyAreaKey[];

/** Where the work goes, per finding type. Never the finding's own name. An empty list says nothing at all. */
export const FINDING_AREA_KEYS: Record<PostureFindingType, BodyAreaKey[]> = {
  forward_head: ['neck', 'upper_back'],
  rounded_shoulders: ['shoulders', 'upper_back'],
  elevated_shoulder: ['shoulders'],
  pelvic_tilt: ['hips', 'lower_back'],
  thoracic_kyphosis: ['upper_back'],
  lumbar_posture: ['lower_back'],
  knee_valgus: ['knees', 'hips'],
  foot_turnout: ['feet'],
  weight_shift: ['hips', 'feet'],
  breathing_pattern: ['breathing'],
  hip_asymmetry: ['hips'],
  lateral_trunk_asymmetry: ['hips', 'trunk_sides'],
  lower_crossed_pattern: ['hips', 'deep_core'],
  sagittal_trunk_posture: ['upper_back', 'trunk_sides'],
  pelvic_drop_screening: ['hips'],
  // A coach-defined observation. Its text is the coach's own free writing,
  // so there is no plain-language area that can be derived from it, and a
  // guess would be a claim nobody made.
  custom: [],
};

/**
 * Findings a member's explanation may draw on at all: one a human has
 * looked at or that is waiting to be looked at, and that actually observed
 * something. `none` observed nothing, and `unknown` is "we could not tell",
 * which is not a thing to build a sentence about.
 */
const READABLE_STATUSES = new Set(['pending_review', 'confirmed', 'coach_overridden']);
const OBSERVED_SEVERITIES = new Set<FindingSeverity>(['mild', 'moderate', 'significant']);

export interface BodyAreaFindingInput {
  finding_type: PostureFindingType;
  severity: FindingSeverity;
  status: string;
}

/**
 * The body areas a member's program explanation may mention, deduplicated
 * and in the order the findings came back. Severity decides only WHETHER an
 * area is mentioned, never how it is described: a significant finding and a
 * mild one produce exactly the same keys.
 */
export function bodyAreaKeysFromFindings(
  findings: readonly BodyAreaFindingInput[] | null | undefined
): BodyAreaKey[] {
  const keys: BodyAreaKey[] = [];
  for (const finding of findings ?? []) {
    if (!READABLE_STATUSES.has(finding.status)) continue;
    if (!OBSERVED_SEVERITIES.has(finding.severity)) continue;
    for (const key of FINDING_AREA_KEYS[finding.finding_type] ?? []) {
      if (!keys.includes(key)) keys.push(key);
    }
  }
  return keys;
}

/** The same areas as the words she reads. */
export function bodyAreaPhrases(keys: readonly BodyAreaKey[]): string[] {
  return keys.map((key) => BODY_AREA_PHRASE[key]);
}

/** "a, b and c". Two items get "and" with no comma, which is how a person says it. */
export function joinPhrases(parts: readonly string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

/**
 * Equipment tokens as a member would name them. The catalog stores
 * 'dumbbell' and 'foam_roller'; she owns a pair of dumbbells and a foam
 * roller. 'bodyweight' names no object at all and is dropped, because the
 * sentence it appears in already says she needs a floor.
 */
const EQUIPMENT_PHRASE: Record<string, string | null> = {
  bodyweight: null,
  none: null,
  dumbbell: 'a pair of dumbbells',
  dumbbells: 'a pair of dumbbells',
  kettlebell: 'a kettlebell',
  barbell: 'a barbell',
  band: 'a resistance band',
  resistance_band: 'a resistance band',
  'resistance band': 'a resistance band',
  foam_roller: 'a foam roller',
  'foam roller': 'a foam roller',
  mat: 'a mat',
  bench: 'a bench',
  box: 'a box or a sturdy chair',
  wall: 'a wall',
  chair: 'a chair',
};

/** What she actually needs to have, in plain words. Unknown tokens pass through as themselves rather than being dropped, because a missing piece of equipment is worse than an awkward word. */
export function equipmentPhrases(equipment: readonly string[] | null | undefined): string[] {
  const phrases: string[] = [];
  for (const raw of equipment ?? []) {
    const key = raw.trim().toLowerCase();
    if (key === '') continue;
    const mapped = key in EQUIPMENT_PHRASE ? EQUIPMENT_PHRASE[key] : raw.trim();
    if (!mapped) continue;
    if (!phrases.includes(mapped)) phrases.push(mapped);
  }
  return phrases;
}
