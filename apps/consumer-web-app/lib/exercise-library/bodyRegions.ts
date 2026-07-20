/**
 * "Body region" search support (upper body / lower body / core / full
 * body). ExerciseAPI.dev's own `/exercises` search does not accept a body
 * -region parameter — only a single `muscle` value — so a region filter is
 * applied client-side in app/api/exercises/route.ts by checking whether an
 * already-fetched exercise's primary/secondary muscles fall in the
 * requested region, rather than by inventing an API parameter that doesn't
 * exist. MUSCLE_TO_BODY_REGION covers the muscle vocabulary ExerciseAPI.dev
 * returns from its own /muscles endpoint (the same names the free-exercise
 * -db-style dataset it's built on uses); resolveBodyRegion falls back to a
 * substring match for any muscle name not listed explicitly, and returns
 * null (no region match) rather than guessing when nothing matches.
 */

export type BodyRegion = 'upper_body' | 'lower_body' | 'core' | 'full_body';

export const BODY_REGION_OPTIONS: { value: BodyRegion; label: string }[] = [
  { value: 'upper_body', label: 'Upper Body' },
  { value: 'lower_body', label: 'Lower Body' },
  { value: 'core', label: 'Core' },
  { value: 'full_body', label: 'Full Body' },
];

const MUSCLE_TO_BODY_REGION: Record<string, BodyRegion> = {
  chest: 'upper_body',
  shoulders: 'upper_body',
  triceps: 'upper_body',
  biceps: 'upper_body',
  forearms: 'upper_body',
  lats: 'upper_body',
  'middle back': 'upper_body',
  traps: 'upper_body',
  neck: 'upper_body',
  abdominals: 'core',
  'lower back': 'core',
  obliques: 'core',
  quadriceps: 'lower_body',
  hamstrings: 'lower_body',
  glutes: 'lower_body',
  calves: 'lower_body',
  adductors: 'lower_body',
  abductors: 'lower_body',
  'full body': 'full_body',
};

/** Returns null when the muscle name doesn't map to a known region — callers should treat that as "don't filter it out," not "exclude it." */
export function resolveBodyRegion(muscle: string): BodyRegion | null {
  const normalized = muscle.trim().toLowerCase();
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
