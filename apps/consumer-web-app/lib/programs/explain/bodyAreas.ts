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
 * Null means "nothing can truthfully be said in plain words about this
 * one", and a null is dropped rather than guessed at. `custom` is the
 * obvious case: a coach-typed observation could say anything at all.
 */
import type { FindingSeverity, PostureFindingType } from '@mef/shared-types-contracts';

/** Where the work goes, per finding type. Never the finding's own name. */
export const FINDING_BODY_AREA: Record<PostureFindingType, string | null> = {
  forward_head: 'your neck and upper back',
  rounded_shoulders: 'your shoulders and upper back',
  elevated_shoulder: 'your shoulders',
  pelvic_tilt: 'your hips and lower back',
  thoracic_kyphosis: 'your upper back',
  lumbar_posture: 'your lower back',
  knee_valgus: 'your knees and hips',
  foot_turnout: 'your feet and ankles',
  weight_shift: 'your hips and feet',
  breathing_pattern: 'your breathing',
  hip_asymmetry: 'your hips',
  lateral_trunk_asymmetry: 'your hips and the sides of your trunk',
  lower_crossed_pattern: 'your hips and your deep core',
  sagittal_trunk_posture: 'your upper back and trunk',
  pelvic_drop_screening: 'your hips',
  // A coach-defined observation. Its text is the coach's own free writing,
  // so there is no plain-language area that can be derived from it, and a
  // guess would be a claim nobody made.
  custom: null,
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
 * mild one produce exactly the same words.
 */
export function bodyAreasFromFindings(
  findings: readonly BodyAreaFindingInput[] | null | undefined
): string[] {
  const areas: string[] = [];
  for (const finding of findings ?? []) {
    if (!READABLE_STATUSES.has(finding.status)) continue;
    if (!OBSERVED_SEVERITIES.has(finding.severity)) continue;
    const area = FINDING_BODY_AREA[finding.finding_type];
    if (!area) continue;
    if (!areas.includes(area)) areas.push(area);
  }
  return areas;
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
