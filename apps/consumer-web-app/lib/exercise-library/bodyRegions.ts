/**
 * "Body region" search support (upper body / lower body / core / full
 * body). Your Move's own catalog has no body-region field — only a
 * primary muscleGroup + secondary muscles — so a region filter is applied
 * over already-fetched exercise_catalog rows by checking whether the
 * exercise's primary/secondary muscles fall in the requested region.
 * MUSCLE_TO_BODY_REGION covers the muscle vocabulary Your Move actually
 * returns (audited live against its real catalog, see
 * scripts/exercise-media/fetch-your-move-catalog.ts) — a handful of
 * muscleGroup values Your Move itself returns are not muscles at all
 * (e.g. "bodyweight", "smith-machine", data-quality artifacts on their
 * side) and are deliberately left unmapped rather than guessed;
 * resolveBodyRegion falls back to a substring match for anything not
 * listed explicitly, and returns null (no region match) rather than
 * guessing when nothing matches.
 */

export type BodyRegion = 'upper_body' | 'lower_body' | 'core' | 'full_body';

export const BODY_REGION_OPTIONS: { value: BodyRegion; label: string }[] = [
  { value: 'upper_body', label: 'Upper Body' },
  { value: 'lower_body', label: 'Lower Body' },
  { value: 'core', label: 'Core' },
  { value: 'full_body', label: 'Full Body' },
];

const MUSCLE_TO_BODY_REGION: Record<string, BodyRegion> = {
  // Upper body
  chest: 'upper_body',
  upper_chest: 'upper_body',
  lower_chest: 'upper_body',
  pectoralis_major: 'upper_body',
  pectoralis_minor: 'upper_body',
  shoulders: 'upper_body',
  front_deltoids: 'upper_body',
  rear_deltoids: 'upper_body',
  lateral_deltoids: 'upper_body',
  rotator_cuff: 'upper_body',
  supraspinatus: 'upper_body',
  infraspinatus: 'upper_body',
  teres_major: 'upper_body',
  teres_minor: 'upper_body',
  triceps: 'upper_body',
  triceps_long_head: 'upper_body',
  triceps_lateral_head: 'upper_body',
  biceps: 'upper_body',
  biceps_long_head: 'upper_body',
  brachialis: 'upper_body',
  brachioradialis: 'upper_body',
  forearms: 'upper_body',
  forearm_flexors: 'upper_body',
  forearm_extensors: 'upper_body',
  wrist_flexors: 'upper_body',
  back: 'upper_body',
  lats: 'upper_body',
  traps: 'upper_body',
  upper_traps: 'upper_body',
  middle_traps: 'upper_body',
  lower_traps: 'upper_body',
  rhomboids: 'upper_body',
  upper_back: 'upper_body',
  serratus_anterior: 'upper_body',
  neck: 'upper_body',
  sternocleidomastoid: 'upper_body',
  cervical_extensors: 'upper_body',

  // Core
  core: 'core',
  abs: 'core',
  lower_abs: 'core',
  rectus_abdominis: 'core',
  transverse_abdominis: 'core',
  obliques: 'core',
  external_obliques: 'core',
  internal_obliques: 'core',
  erector_spinae: 'core',
  spinal_erectors: 'core',
  lower_back: 'core',

  // Lower body
  quads: 'lower_body',
  quadriceps: 'lower_body',
  rectus_femoris: 'lower_body',
  hamstrings: 'lower_body',
  glutes: 'lower_body',
  glute_max: 'lower_body',
  glute_med: 'lower_body',
  calves: 'lower_body',
  gastrocnemius: 'lower_body',
  soleus: 'lower_body',
  adductors: 'lower_body',
  abductors: 'lower_body',
  hip_flexors: 'lower_body',
  iliopsoas: 'lower_body',
  tensor_fasciae_latae: 'lower_body',
  tibialis_anterior: 'lower_body',
  peroneals: 'lower_body',
  legs: 'lower_body',

  // Full body
  full_body: 'full_body',
  cardiovascular_system: 'full_body',
};

/** Returns null when the muscle name doesn't map to a known region — callers should treat that as "don't filter it out," not "exclude it." */
export function resolveBodyRegion(muscle: string): BodyRegion | null {
  const normalized = muscle.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (MUSCLE_TO_BODY_REGION[normalized]) return MUSCLE_TO_BODY_REGION[normalized];

  for (const [name, region] of Object.entries(MUSCLE_TO_BODY_REGION)) {
    if (normalized.includes(name) || name.includes(normalized)) return region;
  }
  return null;
}

/** True if any of an exercise's muscles fall in the requested region. */
export function musclesMatchBodyRegion(muscles: string[], region: BodyRegion): boolean {
  return muscles.some((muscle) => resolveBodyRegion(muscle) === region);
}
