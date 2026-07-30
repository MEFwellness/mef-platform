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
};

/** Rewrites a member-typed search term to its canonical alias, if one exists; otherwise returns the term unchanged. */
export function resolveSearchAlias(term: string): string {
  const normalized = term.trim().toLowerCase();
  return SEARCH_ALIASES[normalized] ?? term;
}
