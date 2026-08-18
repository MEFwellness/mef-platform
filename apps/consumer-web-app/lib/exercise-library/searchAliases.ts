/**
 * Search aliases — member-facing terms rewritten to a term more likely to
 * appear in a Your Move exercise title before the query goes out. Search
 * itself is a plain substring match against exercise_catalog.name (see
 * lib/your-move/catalog.ts's searchExerciseCatalog), not a vendor API
 * call, so aliases here target common title vocabulary rather than a
 * vendor's muscle taxonomy.
 *
 * Adding a new alias is a one-line addition to SEARCH_ALIASES — nothing
 * else in the search path changes.
 */

const SEARCH_ALIASES: Record<string, string> = {
  abs: 'ab',
  core: 'core',
  legs: 'leg',
  glutes: 'glute',
  butt: 'glute',
  arms: 'arm',
  back: 'back',
  cardio: 'cardio',
  hiit: 'hiit',
  stretching: 'stretch',
  warmup: 'warm up',
  'warm-up': 'warm up',

  // Migrations 182 and 183 renamed 120 catalog rows out of vendor plumbing.
  // Almost every rename kept the movement words in the same order, so a
  // coach's usual search still matches ("calf stretch", "warrior iii",
  // "palm-in"). These are the handful where a WORD changed, which is the
  // only case a substring search cannot follow: three vendor typos, a
  // stray "My", an abbreviation, and two names that gained a word.
  'singel arm push up': 'single arm push up',
  'cuads belt squat machine': 'quad belt squat machine',
  'my side bend stretch': 'side bend stretch',
  'standing one-arm db triceps extension': 'standing one-arm triceps extension',
  'standing one-arm dbl triceps extension': 'standing one-arm triceps extension',
  'narrow squats chair': 'narrow squats',
  'jumping ropes skips': 'jumping rope skips',
};

/** Rewrites a member-typed search term to its canonical alias, if one exists; otherwise returns the term unchanged. */
export function resolveSearchAlias(term: string): string {
  const normalized = term.trim().toLowerCase();
  return SEARCH_ALIASES[normalized] ?? term;
}
